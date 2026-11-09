// The vault setup: the settings note (`Vault settings.md` at the vault root) applied to the vault, and the vault's changes taken
// back into it. See SPEC.md, "Vault setup". The rules:
// - the note wins: at start and whenever the note changes, its values are applied;
// - a change made in Obsidian's Settings window (or a property type set from a note) is written into the note;
// - any other change (a synced file, another plugin, a command) is put back from the note, within the fight limits;
// - installing or removing a plugin waits for one click in a dialog.
import {
  App,
  EventRef,
  moment,
  Notice,
  parseYaml,
  Platform,
  PluginManifest,
  requestUrl,
  requireApiVersion,
  stringifyYaml,
  TFile,
} from "obsidian";
import { around } from "monkey-around";
import { DriftGuard } from "../drift";
import { list } from "../defaults";
import { capture, Captured, differences, equal, isObject, JsonObject, toJson, withoutDefaults } from "./json";
import {
  appliesHere,
  Block,
  blockKey,
  BlockError,
  blockValue,
  Note,
  PluginBlock,
  PluginState,
  isReservedConfig,
  readNote,
} from "./model";
import { addLinesAfter, appendSection, findBlocks, replaceBlockYaml } from "./note";
import {
  appTarget,
  configFileTarget,
  corePluginsTarget,
  hotkeysTarget,
  pluginTarget,
  propertyTypesTarget,
  readJsonFile,
  Target,
  writeJsonFile,
} from "./targets";
import { SetupModal } from "./modal";
import BUNDLED_NOTE from "../vault-settings.md";

/** What the vault setup needs from the plugin. */
export interface SetupHost {
  app: App;
  manifest: PluginManifest;
  notePath(): string;
  enabled(): boolean;
  /** The plugin's own settings (as its data.json holds them), and how to take new ones. */
  ownDefaults(): JsonObject;
  applyOwnSettings(all: JsonObject): Promise<void>;
  commandName(id: string): string;
  register(cb: () => void): void;
  registerEvent(ref: EventRef): void;
  /** A watched thing (a block key, or "plugins") was checked after a change. */
  checked?(key: string): void;
}

const BRAT = "obsidian42-brat";
/** Keys of a plugin's settings never taken into the note: what the plugin keeps for itself. */
const ALWAYS_IGNORED: Record<string, string[]> = { [BRAT]: ["pluginList", "pluginSubListFrozenVersion", "themesList"] };
/** Keys of any plugin's settings that are its own bookkeeping, not a preference (the last version it saw). */
const IGNORED_EVERYWHERE = ["previousRelease"];
/**
 * This plugin's own settings the note never holds: which note to read, and whether to, are this device's (a note
 * can't say where the note is).
 */
export const OWN_LOCAL = ["setupNote", "setupEnabled"];
/** How long after the Settings window closes a change still counts as made there (plugins save a moment later). */
const SETTINGS_GRACE_MS = 3000;
const CHECK_DELAY_MS = 300;
const NOTE_DELAY_MS = 1000;
const FIRST_RUN_KEY = "editor-defaults-archit:setup-applied";

/** What the settings tab shows. */
export interface SetupStatus {
  note: "off" | "missing" | "ok";
  errors: BlockError[];
  install: string[];
  uninstall: string[];
  /** Where the vault doesn't hold the note's values, as notices name them. */
  differences: string[];
  lastRun: number;
}

/** A plugin's defaults as measured when the setup installed it (plugin-defaults.json, next to data.json). */
type DefaultsStore = Record<string, { version: string; settings: JsonObject }>;

export class VaultSetup {
  status: SetupStatus = { note: "missing", errors: [], install: [], uninstall: [], differences: [], lastRun: 0 };
  private note: Note | null = null;
  private snapshots = new Map<string, JsonObject>();
  private states: Record<string, PluginState> = {};
  private queue: Promise<unknown> = Promise.resolve();
  private applying = false;
  private dirty = new Set<string>();
  private timers = new Map<string, number>();
  private guard = new DriftGuard();
  private settingsClosedAt = 0;
  private userTypesUntil = 0;
  /** What was declined this session ("Not now"): not asked again unless it changes, or by the command. */
  private declined: string | null = null;
  private warned = new Set<string>();
  private defaultsStore: DefaultsStore = {};
  private communityRepos: Record<string, string> | null = null;
  private stopped = false;
  /** The note was just made from the bundled one: the next run asks as on a new device. */
  private justCreated = false;

  constructor(private host: SetupHost) {}

  private get app() {
    return this.host.app;
  }

  async start() {
    this.defaultsStore = await this.loadDefaultsStore();
    this.watch();
    await this.bootstrap();
    await this.run();
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) window.clearTimeout(t);
  }

  /** The note's path or the setup's on/off changed: the old note isn't used for any check from now on. */
  forgetNote() {
    this.note = null;
  }

  /** Applies the note now; with `ask`, also asks about installs and removals declined before (and makes a missing note). */
  run(ask = false): Promise<void> {
    const r = this.queue.then(() => this.runNow(ask));
    this.queue = r.catch(e => console.error("[editor-defaults] vault setup failed", e));
    return r;
  }

  /** The note's hotkeys (for the clash warnings). */
  noteHotkeys(): Record<string, string[]> {
    const b = this.here().find(x => x.kind === "obsidian" && x.target === "hotkeys");
    const out: Record<string, string[]> = {};
    if (!b) return out;
    const want = hotkeysTarget(this.app, id => this.host.commandName(id)).wanted(b.settings);
    for (const [id, keys] of Object.entries(want))
      if (Array.isArray(keys)) out[id] = keys.filter((k): k is string => typeof k === "string");
    return out;
  }

  // ---------- reading the note ----------

  private noteFile(): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.host.notePath());
    return f instanceof TFile ? f : null;
  }

  private async readNote(): Promise<Note | null> {
    const f = this.noteFile();
    if (!f) return null;
    return readNote(await this.app.vault.read(f), parseYaml);
  }

  private here(): Block[] {
    return (this.note?.blocks ?? []).filter(b => appliesHere(b, Platform.isMobile));
  }

  private block(key: string): Block | undefined {
    return this.here().find(b => blockKey(b) === key);
  }

  private isLoaded = (id: string) => !!this.app.plugins?.plugins?.[id];

  private target(key: string): Target | null {
    if (key === "app") return appTarget(this.app);
    if (key === "core-plugins") return corePluginsTarget(this.app, this.isLoaded);
    if (key === "hotkeys") return hotkeysTarget(this.app, id => this.host.commandName(id));
    if (key === "property-types") return propertyTypesTarget(this.app);
    if (key.startsWith("config:")) return configFileTarget(this.app, key.slice(7));
    if (key.startsWith("plugin:")) {
      const id = key.slice(7);
      const defaults = id === this.host.manifest.id ? this.host.ownDefaults() : this.defaultsStore[id]?.settings;
      const t = pluginTarget(this.app, id, {
        selfId: this.host.manifest.id,
        ...(defaults ? { defaults } : {}),
        writeSelf: all => this.host.applyOwnSettings(all),
      });
      if (id !== this.host.manifest.id) return t;
      // the note never sets which note to read (OWN_LOCAL)
      const local = (v: JsonObject) => Object.fromEntries(Object.entries(v).filter(([k]) => !OWN_LOCAL.includes(k)));
      return { ...t, read: async () => local(await t.read()), wanted: v => local(t.wanted(v)) };
    }
    return null;
  }

  // ---------- applying ----------

  private async runNow(ask: boolean) {
    if (this.stopped) return;
    if (!this.host.enabled()) {
      this.note = null;
      this.status = { ...this.status, note: "off", errors: [], install: [], uninstall: [], differences: [] };
      return;
    }
    if (ask) await this.bootstrap();
    this.note = await this.readNote();
    this.guard = new DriftGuard();
    if (!this.note) {
      this.status = { ...this.status, note: "missing", errors: [], install: [], uninstall: [], differences: [] };
      this.warnOnce(
        `missing:${this.host.notePath()}`,
        `Editor Defaults (Archit): there is no settings note at ${this.host.notePath()}; nothing is applied. It's ` +
          'made from the default at the next start (or with the command "Apply the settings note now").',
      );
      return;
    }
    for (const e of this.note.errors)
      this.warnOnce(
        `err:${e.at.line}:${e.message}`,
        `Editor Defaults (Archit): the settings note's block at line ${e.at.line}${e.at.heading ? ` (${e.at.heading})` : ""} isn't used: ${e.message}`,
      );
    this.applying = true;
    try {
      const plan = await this.plan();
      const firstRun = this.justCreated || !this.app.loadLocalStorage(FIRST_RUN_KEY);
      const needsAsk = plan.install.length || plan.uninstall.length || (firstRun && plan.differences.length);
      let choice: "apply" | "values" | "adopt" | "later" = "values";
      const askKey = JSON.stringify([plan.install.map(b => b.id), plan.uninstall.map(b => b.id), firstRun]);
      if (needsAsk && (ask || this.declined !== askKey)) {
        // a dialog opens in the active window; the Settings window (where trusting a new vault's plugins lands)
        // would take it along when it closes: ask once it's closed, in the main window
        while (this.app.setting?.isOpen && !this.stopped) await sleep(500);
        if (this.stopped) return;
        choice = await new SetupModal(this.app, {
          install: plan.install.map(b => this.pluginLabel(b)),
          uninstall: plan.uninstall.map(b => this.pluginLabel(b)),
          differences: firstRun ? plan.differences : [],
          notePath: this.host.notePath(),
          canAdopt: firstRun,
        }).choose();
        if (choice === "later") this.declined = askKey;
        else {
          this.app.saveLocalStorage(FIRST_RUN_KEY, true);
          this.justCreated = false;
        }
      } else if (needsAsk && firstRun) choice = "later";
      else if (!needsAsk && firstRun) {
        this.app.saveLocalStorage(FIRST_RUN_KEY, true);
        this.justCreated = false;
      }
      if (choice === "adopt") {
        await this.adoptVault();
      } else if (choice !== "later" || !firstRun) {
        if (choice === "apply") {
          for (const b of plan.install)
            await this.install(b).catch(e => {
              console.error(`[editor-defaults] could not install ${b.id}`, e);
              new Notice(`Editor Defaults (Archit) couldn't install ${b.id}: ${String(e)}`, 10000);
            });
          for (const b of plan.uninstall)
            await this.uninstall(b).catch(e => console.error(`[editor-defaults] could not remove ${b.id}`, e));
        }
        await this.applyStates();
        await this.applyValues();
        await this.registerWithBrat();
      }
    } finally {
      this.applying = false;
    }
    await this.refreshSnapshots();
    const after = await this.plan();
    this.status = {
      note: "ok",
      errors: this.note.errors,
      install: after.install.map(b => this.pluginLabel(b)),
      uninstall: after.uninstall.map(b => this.pluginLabel(b)),
      differences: after.differences,
      lastRun: Date.now(),
    };
    this.flushDirty();
  }

  /** A change that came in while applying gets a check of its own. */
  private flushDirty() {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const k of dirty) this.changed(k);
  }

  private pluginLabel(b: PluginBlock) {
    const src = b.source.type === "github" ? b.source.repo : "community plugins";
    return `${this.app.plugins?.manifests?.[b.id]?.name ?? b.id} (${src})`;
  }

  /** What applying the note would do: plugins to install or remove, and values the vault holds differently. */
  async plan(): Promise<{ install: PluginBlock[]; uninstall: PluginBlock[]; differences: string[] }> {
    const manifests = this.app.plugins?.manifests ?? {};
    const install: PluginBlock[] = [];
    const uninstall: PluginBlock[] = [];
    const diffs: string[] = [];
    for (const b of this.here()) {
      if (b.kind === "plugin" && b.id !== this.host.manifest.id) {
        const has = !!manifests[b.id];
        if (b.state === "uninstalled") {
          if (has) uninstall.push(b);
          continue;
        }
        if (!has) {
          install.push(b);
          continue;
        }
        const on = this.app.plugins?.enabledPlugins?.has(b.id) ?? false;
        if (on !== (b.state === "enabled")) diffs.push(`${b.id} ${b.state}`);
      }
      const t = this.target(blockKey(b));
      if (!t) continue;
      const now = await t.read();
      for (const p of differences(t.wanted(b.settings), now)) diffs.push(t.name(p));
    }
    return { install, uninstall, differences: diffs };
  }

  private async applyStates() {
    const pm = this.app.plugins;
    if (!pm) return;
    for (const b of this.here()) {
      if (b.kind !== "plugin" || b.id === this.host.manifest.id || !pm.manifests?.[b.id]) continue;
      const on = pm.enabledPlugins?.has(b.id) ?? false;
      if (b.state === "enabled" && !on) await pm.enablePluginAndSave?.(b.id);
      if (b.state === "disabled" && on) await pm.disablePluginAndSave?.(b.id);
    }
  }

  /** Writes every block's values where the vault differs. Returns what was set, as notices name it. */
  private async applyValues(only?: string): Promise<string[]> {
    const done: string[] = [];
    for (const b of this.here()) {
      const key = blockKey(b);
      if (only && key !== only) continue;
      if (b.kind === "plugin" && b.id !== this.host.manifest.id && !this.app.plugins?.manifests?.[b.id]) continue;
      const t = this.target(key);
      if (!t) continue;
      const want = t.wanted(b.settings);
      const paths = differences(want, await t.read());
      if (!paths.length) continue;
      try {
        await t.write(want, paths);
        done.push(...paths.map(p => t.name(p)));
      } catch (e) {
        console.error(`[editor-defaults] could not apply ${key}`, e);
      }
    }
    return done;
  }

  // ---------- installing ----------

  private async repoOf(b: PluginBlock): Promise<string | null> {
    if (b.source.type === "github") return b.source.repo;
    if (!this.communityRepos) {
      try {
        const r = await requestUrl(
          "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/community-plugins.json",
        );
        const list: unknown = r.json;
        this.communityRepos = {};
        if (Array.isArray(list))
          for (const e of list)
            if (isObject(toJson(e))) {
              const o = toJson(e);
              if (isObject(o) && typeof o.id === "string" && typeof o.repo === "string")
                this.communityRepos[o.id] = o.repo;
            }
      } catch (e) {
        console.error("[editor-defaults] could not read Obsidian's community plugin list", e);
        return null;
      }
    }
    return this.communityRepos[b.id] ?? null;
  }

  private async install(b: PluginBlock): Promise<boolean> {
    const pm = this.app.plugins;
    const fail = (why: string) => {
      console.warn(`[editor-defaults] couldn't install ${b.id}: ${why}`);
      new Notice(`Editor Defaults (Archit) couldn't install ${b.id}: ${why}`, 10000);
      return false;
    };
    if (typeof pm?.installPlugin !== "function") return fail("this Obsidian has no plugin installer");
    const repo = await this.repoOf(b);
    if (!repo) return fail("it isn't in Obsidian's community plugin list (or the list couldn't be read)");
    // the release's manifest.json; a release without one (older plugins) has it in the repo, as Obsidian reads it
    const where = b.version ? `download/${b.version}` : "latest/download";
    const release = `https://github.com/${repo}/releases/${where}/manifest.json`;
    const head = `https://raw.githubusercontent.com/${repo}/HEAD/manifest.json`;
    // a community plugin is what its repo's manifest.json says (as Obsidian installs it: a repo's latest release
    // can be another plugin's beta); a GitHub one is its release, as BRAT installs it
    const urls = b.version ? [release] : b.source.type === "community" ? [head, release] : [release, head];
    let manifest: PluginManifest | null = null;
    for (const url of urls) {
      try {
        const m: unknown = (await requestUrl(url)).json;
        if (isPluginManifest(m)) {
          manifest = m;
          break;
        }
      } catch {
        // try the next place
      }
    }
    if (!manifest)
      return fail(`no manifest.json in ${repo}'s ${b.version ? `release ${b.version}` : "latest release"}`);
    if (manifest.id !== b.id) return fail(`${repo} is the plugin "${manifest.id}"`);
    if (manifest.minAppVersion && !requireApiVersion(manifest.minAppVersion))
      return fail(`it needs Obsidian ${manifest.minAppVersion}`);
    // a download can fail now and then (GitHub answers 404 for a moment): one more try
    for (let attempt = 0; attempt < 2 && !pm.manifests?.[b.id]; attempt++) {
      if (attempt) await sleep(2000);
      await pm.installPlugin(repo, manifest.version, manifest);
      await pm.loadManifests?.();
    }
    const installed = pm.manifests?.[b.id];
    if (!installed) return fail("Obsidian's installer didn't install it");
    const file = `${installed.dir ?? `${this.app.vault.configDir}/plugins/${b.id}`}/data.json`;
    // its defaults: what it holds when loaded once without any settings
    if (!(await this.app.vault.adapter.exists(file)) && (await pm.enablePlugin?.(b.id))) {
      const settings = await this.measureDefaults(b.id, file);
      if (settings) {
        this.defaultsStore[b.id] = { version: manifest.version, settings };
        await this.saveDefaultsStore();
      }
      await pm.disablePlugin?.(b.id);
    }
    if (Object.keys(b.settings).length) {
      const t = this.target(`plugin:${b.id}`);
      if (t) await writeJsonFile(this.app, file, { ...(await t.read()), ...structuredClone(b.settings) });
    }
    if (b.state === "enabled") await pm.enablePluginAndSave?.(b.id);
    return true;
  }

  /**
   * A plugin's defaults, just after it loaded without settings: its settings object (some keep it in a settings
   * manager, some fill it a moment after loading), or else the data.json it wrote while loading.
   */
  private async measureDefaults(id: string, file: string): Promise<JsonObject | null> {
    for (let i = 0; i < 20; i++) {
      const p = asRecord(this.app.plugins?.plugins?.[id]);
      const s = asRecord(p?.settings);
      const m = asRecord(p?.settingsManager);
      for (const c of [p?.settings, s?.settings, s?.data, m?.settings]) {
        const j = toJson(c);
        if (isObject(j) && Object.keys(j).length) return j;
      }
      const written = await readJsonFile(this.app, file);
      if (Object.keys(written).length) return written;
      await sleep(100);
    }
    return null;
  }

  private async uninstall(b: PluginBlock) {
    await this.app.plugins?.uninstallPlugin?.(b.id);
  }

  /** Adds the note's GitHub plugins to BRAT's list, so BRAT updates them (a pinned version stays pinned). */
  private async registerWithBrat() {
    const pm = this.app.plugins;
    const wanted = this.here().filter(
      (b): b is PluginBlock & { source: { type: "github"; repo: string } } =>
        b.kind === "plugin" && b.source.type === "github" && b.state !== "uninstalled",
    );
    if (!wanted.length || !pm?.manifests?.[BRAT]) return;
    const brat = asRecord(pm.plugins?.[BRAT]);
    const live = brat && isRecord(brat.settings) ? brat.settings : null;
    const file = `${pm.manifests[BRAT]?.dir ?? `${this.app.vault.configDir}/plugins/${BRAT}`}/data.json`;
    const data: Record<string, unknown> = live ?? (await readJsonFile(this.app, file));
    const listed = Array.isArray(data.pluginList) ? data.pluginList : (data.pluginList = []);
    const frozen = Array.isArray(data.pluginSubListFrozenVersion)
      ? data.pluginSubListFrozenVersion
      : (data.pluginSubListFrozenVersion = []);
    let changed = false;
    for (const b of wanted) {
      const version = b.version ?? "latest";
      if (!listed.includes(b.source.repo)) {
        listed.push(b.source.repo);
        changed = true;
      }
      const entry = frozen.find((e): e is Record<string, unknown> => isRecord(e) && e.repo === b.source.repo);
      if (!entry) {
        frozen.push({ repo: b.source.repo, version });
        changed = true;
      } else if (entry.version !== version) {
        entry.version = version;
        changed = true;
      }
    }
    if (!changed) return;
    const save = brat?.saveSettings;
    if (live && typeof save === "function") await Reflect.apply(save, brat, []);
    else {
      const json = toJson(data);
      if (isObject(json)) await writeJsonFile(this.app, file, json);
    }
  }

  // ---------- watching ----------

  private settingsWindowRecently(): boolean {
    return !!this.app.setting?.isOpen || Date.now() - this.settingsClosedAt < SETTINGS_GRACE_MS;
  }

  private watch() {
    const app = this.app;
    const self = this;
    const cfg = app.vault.configDir;
    const reg = (cb: () => void) => this.host.register(cb);
    const ev = (ref: EventRef) => this.host.registerEvent(ref);
    ev(app.vault.on("config-changed", () => this.changed("app")));
    const core = app.internalPlugins;
    if (typeof core?.on === "function") ev(core.on("change", () => this.changed("core-plugins")));
    const hm = app.hotkeyManager;
    if (hm && typeof hm.save === "function")
      reg(
        around(hm, {
          save: next =>
            function (this: unknown, ...args: unknown[]) {
              const saved: unknown = next ? Reflect.apply(next, this, args) : undefined;
              void Promise.resolve(saved).then(
                () => self.changed("hotkeys"),
                () => undefined,
              );
              return saved instanceof Promise ? saved : Promise.resolve();
            },
        }),
      );
    const setting = app.setting;
    if (setting && typeof setting.onClose === "function")
      reg(
        around(setting, {
          onClose: next =>
            function (this: unknown, ...args: unknown[]) {
              self.settingsClosedAt = Date.now();
              return next ? Reflect.apply(next, this, args) : undefined;
            },
        }),
      );
    const mtm = app.metadataTypeManager;
    const markTypes = () => {
      if (!self.applying) self.userTypesUntil = Date.now() + SETTINGS_GRACE_MS;
    };
    if (mtm && typeof mtm.setType === "function")
      reg(
        around(mtm, {
          setType: next =>
            async function (this: unknown, ...args: unknown[]) {
              markTypes();
              await (next ? Reflect.apply(next, this, args) : undefined);
              self.changed("property-types");
            },
          unsetType: next =>
            async function (this: unknown, ...args: unknown[]) {
              markTypes();
              await (next ? Reflect.apply(next, this, args) : undefined);
              self.changed("property-types");
            },
        }),
      );
    ev(
      app.vault.on("raw", (path: string) => {
        if (path === this.host.notePath()) return;
        if (!path.startsWith(`${cfg}/`)) return;
        const rel = path.slice(cfg.length + 1);
        if (rel === "hotkeys.json") return this.changed("hotkeys");
        if (rel === "types.json") return this.changed("property-types");
        if (rel === "community-plugins.json") return this.changed("plugins");
        const pd = /^plugins\/([^/]+)\/(data\.json|manifest\.json)$/.exec(rel);
        if (pd) {
          if (pd[2] === "manifest.json") return this.changed("plugins");
          const id = this.idOfDir(`${cfg}/plugins/${pd[1]}`);
          if (id) this.changed(`plugin:${id}`);
          return;
        }
        if (/^plugins\/[^/]+$/.test(rel)) return this.changed("plugins");
        const cf = /^([a-z0-9][a-z0-9._-]*)\.json$/i.exec(rel);
        if (cf && !isReservedConfig(cf[1])) this.changed(`config:${cf[1]}`);
      }),
    );
    const onNote = (f: { path: string }, old?: string) => {
      const p = this.host.notePath();
      if (f.path === p || old === p) this.later("note", NOTE_DELAY_MS, () => void this.run());
    };
    ev(app.vault.on("modify", f => onNote(f)));
    ev(app.vault.on("create", f => onNote(f)));
    ev(app.vault.on("delete", f => onNote(f)));
    ev(app.vault.on("rename", (f, old) => onNote(f, old)));
  }

  private idOfDir(dir: string): string | null {
    for (const [id, m] of Object.entries(this.app.plugins?.manifests ?? {})) if (m?.dir === dir) return id;
    return null;
  }

  private later(key: string, ms: number, fn: () => void) {
    const t = this.timers.get(key);
    if (t !== undefined) window.clearTimeout(t);
    this.timers.set(
      key,
      window.setTimeout(() => {
        this.timers.delete(key);
        if (!this.stopped) fn();
      }, ms),
    );
  }

  /** Something the setup watches changed: check it shortly, as one check per thing. */
  private changed(key: string) {
    if (this.stopped || !this.note || !this.host.enabled()) return;
    if (this.applying) {
      this.dirty.add(key);
      return;
    }
    const user = key === "property-types" ? Date.now() < this.userTypesUntil : this.settingsWindowRecently();
    this.later(`check:${key}`, CHECK_DELAY_MS, () => {
      this.queue = this.queue
        .then(() => this.check(key, user || this.settingsWindowRecently()))
        .then(() => this.host.checked?.(key))
        .catch(e => console.error(`[editor-defaults] could not check ${key}`, e));
    });
  }

  private async refreshSnapshots() {
    this.states = this.pluginStates();
    const keys = new Set(["app", "core-plugins", "hotkeys", "property-types"]);
    for (const id of Object.keys(this.app.plugins?.manifests ?? {})) keys.add(`plugin:${id}`);
    for (const b of this.note?.blocks ?? []) keys.add(blockKey(b));
    try {
      const listing = await this.app.vault.adapter.list(this.app.vault.configDir);
      for (const f of listing.files) {
        const m = /\/([a-z0-9][a-z0-9._-]*)\.json$/i.exec(f);
        if (m && !isReservedConfig(m[1]) && m[1] !== "types" && m[1] !== "community-plugins")
          keys.add(`config:${m[1]}`);
      }
    } catch {
      // no listing: only the blocks' files are watched for new settings
    }
    for (const k of keys) {
      const t = this.target(k);
      if (t) this.snapshots.set(k, await t.read());
    }
  }

  private pluginStates(): Record<string, PluginState> {
    const out: Record<string, PluginState> = {};
    const pm = this.app.plugins;
    for (const id of Object.keys(pm?.manifests ?? {})) out[id] = pm?.enabledPlugins?.has(id) ? "enabled" : "disabled";
    return out;
  }

  /**
   * One watched thing changed: a change made in Settings goes into the note; any other is put back from the note,
   * each setting at most 5 times in 10 s (then once that window has passed, by itself) and 10 times in 10 minutes
   * (then not again until the note changes or Obsidian restarts). `retry`: the check at the end of such a window.
   */
  private async check(key: string, user: boolean, retry = false) {
    if (this.stopped || !this.note) return;
    if (key === "plugins") return this.checkPlugins(user);
    const t = this.target(key);
    if (!t) return;
    const before = this.snapshots.get(key) ?? {};
    const after = await t.read();
    this.snapshots.set(key, after);
    if (!retry && equal(before, after)) return;
    if (user && !retry) return this.captureChange(key, t, before, after);
    const b = this.block(key);
    if (!b) return;
    const want = t.wanted(b.settings);
    const now = Date.now();
    const paths = differences(want, after).filter(p => {
      const id = `${key}|${p}`;
      if (this.guard.allow(id, now)) return true;
      const at = this.guard.retryAt(id, now);
      if (at !== null)
        this.later(`retry:${key}`, Math.max(0, at - now) + 50, () => {
          this.queue = this.queue.then(() => this.check(key, false, true)).catch(() => undefined);
        });
      return false;
    });
    const stopped = this.guard.takeStopped();
    if (stopped.length)
      new Notice(
        `Editor Defaults (Archit) stopped putting back ${list(stopped.map(id => t.name(id.split("|")[1])))}: it ` +
          "keeps being changed again (another plugin or device). It's put back again after Obsidian restarts or the " +
          "settings note changes.",
        15000,
      );
    if (!paths.length) return;
    for (const p of paths) this.guard.record(`${key}|${p}`, now);
    this.applying = true;
    try {
      await t.write(want, paths);
    } finally {
      this.applying = false;
    }
    this.snapshots.set(key, await t.read());
    this.flushDirty();
    new Notice(
      `Editor Defaults (Archit) put back ${list(paths.map(p => t.name(p)))} from the settings note. To change ` +
        `${paths.length > 1 ? "these" : "this"}, change it in Settings or in ${this.host.notePath()}.`,
      8000,
    );
  }

  // ---------- taking changes into the note ----------

  /** Writes a change made in Settings into the note: the block's YAML, and a dated line per key. */
  private async captureChange(key: string, t: Target, before: JsonObject, after: JsonObject) {
    const b = this.note?.blocks.find(x => blockKey(x) === key);
    let result: Captured;
    if (key === "core-plugins") result = captureCore(b?.settings ?? {}, before, after, t, this.isLoaded);
    else {
      const id = key.slice(7);
      const ignore = key.startsWith("plugin:")
        ? [
            ...(b?.kind === "plugin" ? b.ignore : []),
            ...(ALWAYS_IGNORED[id] ?? []),
            ...IGNORED_EVERYWHERE,
            ...(id === this.host.manifest.id ? OWN_LOCAL : []),
          ]
        : [];
      result = capture(b?.settings ?? {}, before, after, { ignore, ...(t.defaults ? { defaults: t.defaults } : {}) });
    }
    if (!result.added.length && !result.changed.length && !result.removed.length) return;
    const date = moment().format("YYYY-MM-DD");
    const lines = [
      ...result.added.map(p => `\`${p}\` added from Settings, ${date}.`),
      ...result.changed.map(p => `\`${p}\` changed in Settings, ${date}.`),
      ...result.removed.map(p => `\`${p}\` back to its default in Settings, ${date}: taken out.`),
    ];
    if (b) await this.writeBlock(key, blockValue(b, result.values), lines);
    else await this.appendBlock(key, result.values, lines);
    const names = [...result.added, ...result.changed, ...result.removed].map(p => t.name(p));
    new Notice(`Editor Defaults (Archit) saved to the settings note: ${list(names)}.`, 5000);
  }

  private async checkPlugins(user: boolean) {
    const before = this.states;
    const after = this.pluginStates();
    this.states = after;
    const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
    const changes: [string, PluginState][] = [];
    for (const id of ids) {
      const now = after[id] ?? "uninstalled";
      if ((before[id] ?? "uninstalled") !== now) changes.push([id, now]);
    }
    if (!changes.length) return;
    // new plugins' data.json files to diff from now on
    for (const [id] of changes) {
      const t = this.target(`plugin:${id}`);
      if (t && !this.snapshots.has(`plugin:${id}`)) this.snapshots.set(`plugin:${id}`, await t.read());
    }
    if (!user) {
      // turned on or off some other way: the note's states again (installs and removals still ask)
      if (changes.some(([id]) => this.block(`plugin:${id}`))) {
        this.applying = true;
        try {
          await this.applyStates();
        } finally {
          this.applying = false;
        }
        this.states = this.pluginStates();
        this.flushDirty();
      }
      return;
    }
    const date = moment().format("YYYY-MM-DD");
    for (const [id, state] of changes) {
      if (id === this.host.manifest.id) continue;
      const b = this.note?.blocks.find(x => x.kind === "plugin" && x.id === id);
      const word = state === "uninstalled" ? "uninstalled" : state === "enabled" ? "turned on" : "turned off";
      if (b && b.kind === "plugin") {
        if (b.state === state) continue;
        await this.writeBlock(`plugin:${id}`, blockValue({ ...b, state }, b.settings), [
          `${word} in Settings, ${date}.`,
        ]);
      } else if (state !== "uninstalled") {
        const source = await this.sourceOf(id);
        const stub: PluginBlock = {
          kind: "plugin",
          id,
          source,
          state,
          ignore: [],
          at: { from: 0, to: 0, end: 0, yaml: "", heading: "", line: 0 },
          settings: {},
        };
        await this.appendBlock(`plugin:${id}`, {}, [`${word} in Settings, ${date}.`], stub);
      }
      new Notice(`Editor Defaults (Archit) saved to the settings note: ${id} ${word}.`, 5000);
    }
  }

  /** Where an installed plugin came from: BRAT's list (GitHub) when a repo there is named after it, else the community. */
  private async sourceOf(id: string): Promise<PluginBlock["source"]> {
    const dir = this.app.plugins?.manifests?.[BRAT]?.dir;
    if (dir) {
      const data = await readJsonFile(this.app, `${dir}/data.json`);
      const repos = Array.isArray(data.pluginList) ? data.pluginList : [];
      for (const repo of repos) {
        if (typeof repo !== "string") continue;
        const name = repo.toLowerCase().split("/")[1] ?? "";
        if (name === id.toLowerCase() || name === `obsidian-${id.toLowerCase()}`) return { type: "github", repo };
      }
    }
    return { type: "community" };
  }

  /** Rewrites one block in the note (found again by its key, as the note may have changed) and adds lines after it. */
  private async writeBlock(key: string, value: JsonObject, lines: string[]) {
    const f = this.noteFile();
    if (!f) return;
    await this.app.vault.process(f, text => {
      const n = readNote(text, parseYaml);
      const b = n.blocks.find(x => blockKey(x) === key);
      if (!b) return text;
      const updated = replaceBlockYaml(text, b.at, stringifyYaml(value));
      const again = findBlocks(updated).find(x => x.from === b.at.from);
      return again ? addLinesAfter(updated, again, lines) : updated;
    });
    this.note = await this.readNote();
  }

  private async appendBlock(key: string, settings: JsonObject, lines: string[], stub?: PluginBlock) {
    const f = this.noteFile();
    if (!f) return;
    const base: Block = stub ?? (await this.newBlock(key));
    const heading =
      base.kind === "plugin" ? (this.app.plugins?.manifests?.[base.id]?.name ?? base.id) : key.replace(/^config:/, "");
    const yaml = stringifyYaml(blockValue(base, settings));
    await this.app.vault.process(f, text => {
      const withSection = appendSection(text, heading, lines.map(l => `- ${l}`).join("\n"), yaml);
      return withSection;
    });
    this.note = await this.readNote();
  }

  private async newBlock(key: string): Promise<Block> {
    const at = { from: 0, to: 0, end: 0, yaml: "", heading: "", line: 0 };
    if (key.startsWith("plugin:")) {
      const id = key.slice(7);
      return { kind: "plugin", id, source: await this.sourceOf(id), state: "enabled", ignore: [], at, settings: {} };
    }
    const target =
      key === "app" || key === "core-plugins" || key === "hotkeys" || key === "property-types"
        ? key
        : (key as `config:${string}`);
    return { kind: "obsidian", target, at, settings: {} };
  }

  // ---------- the note from the vault ----------

  /** The note's blocks get the vault's values for what they manage (first run: "Update the note from this vault"). */
  private async adoptVault() {
    for (const b of this.note?.blocks ?? []) {
      const key = blockKey(b);
      const t = this.target(key);
      if (!t) continue;
      const now = await t.read();
      let values: JsonObject = {};
      if (key === "core-plugins") {
        for (const [id, v] of Object.entries(b.settings)) {
          const on = now[id];
          if (typeof on !== "boolean") continue;
          values[id] = isObject(v) ? { ...v, enabled: on } : on;
        }
      } else {
        for (const [k, v] of Object.entries(b.settings)) {
          const have = now[k];
          if (have === undefined) continue;
          values[k] = isObject(v) && isObject(have) ? pick(v, have) : have;
        }
        if (t.defaults) values = withoutDefaults(values, t.defaults);
      }
      let state = b.kind === "plugin" ? b.state : undefined;
      if (b.kind === "plugin" && b.id !== this.host.manifest.id) {
        const m = this.app.plugins?.manifests?.[b.id];
        if (m) state = this.app.plugins?.enabledPlugins?.has(b.id) ? "enabled" : "disabled";
      }
      const next = b.kind === "plugin" && state ? { ...b, state } : b;
      if (equal(values, b.settings) && next === b) continue;
      await this.writeBlock(key, blockValue(next, values), [
        `taken from this vault, ${moment().format("YYYY-MM-DD")}.`,
      ]);
    }
  }

  /**
   * The vault has no settings note (at start, or after the setting moved it): it gets the one bundled with the plugin
   * (src/vault-settings.md, the author's setup), dated now. Nothing is applied yet: the run that follows asks, as on a
   * new device (apply it, or take this vault's values into it), and installs ask as always. Returns whether it was made.
   */
  async bootstrap(): Promise<boolean> {
    if (this.stopped || !this.host.enabled() || this.noteFile()) return false;
    const path = this.host.notePath();
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    try {
      if (dir && !this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      await this.app.vault.create(path, bundledNote(moment().format("YYYY-MM-DDTHH:mm:ss")));
    } catch (e) {
      console.error(`[editor-defaults] could not create the settings note at ${path}`, e);
      return false;
    }
    this.justCreated = true;
    new Notice(`Editor Defaults (Archit) created the settings note ${path} from its default.`, 8000);
    return true;
  }

  /** Every block gets the vault's current values (the command "Update the settings note from this vault"). */
  async updateNoteFromVault() {
    this.note = await this.readNote();
    if (!this.note) return;
    this.applying = true;
    try {
      await this.adoptVault();
    } finally {
      this.applying = false;
    }
    await this.refreshSnapshots();
  }

  // ---------- small things ----------

  private warnOnce(key: string, text: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    new Notice(text, 10000);
  }

  private defaultsFile() {
    return `${this.host.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.host.manifest.id}`}/plugin-defaults.json`;
  }

  private async loadDefaultsStore(): Promise<DefaultsStore> {
    const raw = await readJsonFile(this.app, this.defaultsFile());
    const out: DefaultsStore = {};
    for (const [id, v] of Object.entries(raw))
      if (isObject(v) && typeof v.version === "string" && isObject(v.settings))
        out[id] = { version: v.version, settings: v.settings };
    return out;
  }

  private async saveDefaultsStore() {
    const json = toJson(this.defaultsStore);
    if (isObject(json)) await writeJsonFile(this.app, this.defaultsFile(), json);
  }
}

/** Core plugins captured into the note: a rule with onlyWith keeps its form; one not in force isn't touched. */
function captureCore(
  settings: JsonObject,
  before: JsonObject,
  after: JsonObject,
  t: Target,
  isLoaded: (id: string) => boolean,
): Captured {
  const values: JsonObject = { ...settings };
  const out: Captured = { values, added: [], changed: [], removed: [] };
  for (const [id, on] of Object.entries(after)) {
    if (typeof on !== "boolean" || before[id] === on) continue;
    const mine = settings[id];
    if (isObject(mine)) {
      if (typeof mine.onlyWith === "string" && !isLoaded(mine.onlyWith)) continue;
      if (mine.enabled !== on) {
        values[id] = { ...mine, enabled: on };
        out.changed.push(id);
      }
      continue;
    }
    const dflt = typeof t.defaults === "function" ? t.defaults(id) : undefined;
    if (dflt === on) {
      if (mine !== undefined) {
        delete values[id];
        out.removed.push(id);
      }
    } else if (mine === undefined) {
      values[id] = on;
      out.added.push(id);
    } else if (mine !== on) {
      values[id] = on;
      out.changed.push(id);
    }
  }
  return out;
}

/** The parts of `have` that `shape` (an object of the note) names. */
function pick(shape: JsonObject, have: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(shape)) {
    const h = have[k];
    if (h === undefined) continue;
    out[k] = isObject(v) && isObject(h) ? pick(v, h) : h;
  }
  return out;
}

const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return isRecord(v) ? v : null;
}
function isPluginManifest(v: unknown): v is PluginManifest {
  return isRecord(v) && typeof v.id === "string" && typeof v.version === "string" && typeof v.name === "string";
}

/** The bundled settings note, with its `created` property set to `created`. */
export function bundledNote(created: string): string {
  return BUNDLED_NOTE.replace(/^created: .*$/m, `created: ${created}`);
}
