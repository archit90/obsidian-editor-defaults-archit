import { AbstractInputSuggest, Editor, EditorSuggest, Hotkey, Notice, Platform, Plugin, TFile } from "obsidian";
import { around } from "monkey-around";
import {
  CONFIG_RULES,
  ENFORCED,
  HOTKEY_NAMES,
  HOTKEYS,
  hotkeyClashes,
  sameHotkeys,
  wantedCorePlugins,
} from "./defaults";
import { DriftGuard, ENFORCED_CONFIG, revertNotice, stoppedNotice } from "./drift";
import { fixPickedLink, isLinkTrigger, PickFix } from "./links";
import { IsoType, isoifyWidget } from "./properties";
import { DEFAULTS, EditorDefaultsTab, parseSettings, SETTING_NAMES, Settings } from "./settings";

const logError = (what: string) => (e: unknown) => console.error(`[editor-defaults] ${what}`, e);

/** What the [[ link suggesters pass to selectSuggestion (only the fields used here). */
interface LinkSuggestion {
  file?: TFile;
  type?: string;
}

/** The fields of a suggestion item used here, read without trusting its shape. */
function linkSuggestion(item: unknown): LinkSuggestion {
  if (typeof item !== "object" || item === null) return {};
  return {
    file: "file" in item && item.file instanceof TFile ? item.file : undefined,
    type: "type" in item && typeof item.type === "string" ? item.type : undefined,
  };
}

/**
 * Obsidian's own [[ link suggester among the editor suggesters: the one with a suggestManager that finds notes,
 * headings and blocks. Other suggesters (tags, slash commands, every plugin's) are left alone.
 */
function isCoreLinkSuggest(s: unknown): boolean {
  if (typeof s !== "object" || s === null || !("suggestManager" in s)) return false;
  const m = s.suggestManager;
  return typeof m === "object" && m !== null && "getFileSuggestions" in m && typeof m.getFileSuggestions === "function";
}

/**
 * Obsidian's [[ suggester in property values (an AbstractInputSuggest whose class Obsidian doesn't export): Enter
 * or a click hands the finished text to onSelectLink; Tab, `#` and `^` put it in the field and keep the dropdown open.
 */
interface PropertyLinkSuggest {
  inputEl: HTMLElement;
  sourcePath?: string;
  onSelectLink?: (text: string, evt: unknown) => void;
}

/** Its prototype: selectSuggestion and getLinktextQuery are its own (no other AbstractInputSuggest has the latter). */
interface PropertyLinkSuggestProto {
  selectSuggestion(this: PropertyLinkSuggest, item: unknown, evt: unknown): void;
  getLinktextQuery(text: string): string;
}

function isPropertyLinkSuggestProto(proto: unknown): proto is PropertyLinkSuggestProto {
  return (
    typeof proto === "object" &&
    proto !== null &&
    Object.hasOwn(proto, "selectSuggestion") &&
    Object.hasOwn(proto, "getLinktextQuery") &&
    "selectSuggestion" in proto &&
    typeof proto.selectSuggestion === "function"
  );
}

/** How long to wait after a vault setting, core plugin or hotkey changes before checking it. */
const DRIFT_DELAY_MS = 300;

/**
 * The Settings tabs that show values Editor Defaults puts back (Files and links, Core plugins, Hotkeys): redrawn
 * after a put-back so they don't show the undone value. Other tabs, other plugins' among them, are never redrawn.
 */
const REDRAWN_TABS: ReadonlySet<string> = new Set(["file", "plugins", "hotkeys"]);

/** One enforced default that was set: its id (config key, core plugin or command), what it is now, and the setting that keeps it. */
interface Revert {
  id: string;
  what: string;
  setting: keyof Settings;
}

export default class EditorDefaultsPlugin extends Plugin {
  override settings: Settings = { ...DEFAULTS };
  /** Set on unload: whatever is still running (an enforce, the layout-ready callback) stops there. */
  private unloaded = false;
  /** applyDefaults runs one at a time, in the order asked. */
  private queue: Promise<unknown> = Promise.resolve();
  private applying = false;
  /** Something changed while a run was applying (sync, a person, or the run's own writes): check again after it. */
  private dirty = false;
  private driftTimer: number | null = null;
  /** The check scheduled for when the guard lets a refused item be put back again. */
  private recheckTimer: number | null = null;
  private recheckAt = 0;
  private guard = new DriftGuard();
  /** Hotkey clashes already warned about this session ("other command|hotkey"). */
  private warnedClashes = new Set<string>();

  override async onload() {
    // enabled while Obsidian runs: the open notes and Bases tabs already show Obsidian's own date fields
    const midSession = this.app.workspace.layoutReady;
    this.settings = parseSettings(await this.loadData());
    // at start, Obsidian loads plugins before it draws the workspace: every date field gets the patched widget
    this.patchDateWidgets();
    this.addSettingTab(new EditorDefaultsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.applyDefaults()
        .then(() => this.warnHotkeyClashes())
        .catch(logError("could not apply the defaults"));
      this.watchDrift();
      this.patchLinkSuggest();
      this.patchPropertyLinkSuggest();
      if (midSession && this.settings.isoDates) this.rerenderDateFields();
    });
  }

  override onunload() {
    this.unloaded = true;
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    if (this.recheckTimer !== null) window.clearTimeout(this.recheckTimer);
    // the date widgets are unpatched by now: open notes get Obsidian's own date fields back
    if (this.settings.isoDates) this.rerenderDateFields();
  }

  /** data.json changed on disk (this plugin's settings from another device, through sync): use them at once. */
  override async onExternalSettingsChange() {
    if (this.unloaded) return;
    const before = this.settings;
    this.settings = parseSettings(await this.loadData());
    // new settings: every item is enforced afresh, also one stopped for this session
    this.guard = new DriftGuard();
    await this.applyDefaults();
    if (this.unloaded) return;
    if (before.isoDates !== this.settings.isoDates) this.rerenderDateFields();
    const tab = this.openSettingsTab();
    if (tab?.id === this.manifest.id) tab.display?.();
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.guard = new DriftGuard();
    await this.applyDefaults();
  }

  /** The "Dates in properties" setting changed: redraw the date fields of open notes and Bases. */
  async isoDatesChanged() {
    await this.saveSettings();
    this.rerenderDateFields();
  }

  /**
   * Writes each enabled default into the vault config if it differs, except the items `skip` refuses (asked only
   * for items that differ). Returns what was set. Runs one at a time, after any run already asked for. Saving the
   * plugin's settings applies the defaults too, so turning a setting on applies it at once.
   */
  applyDefaults(skip: (id: string) => boolean = () => false): Promise<Revert[]> {
    const run = this.queue.then(() => this.applyNow(skip));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applyNow(skip: (id: string) => boolean): Promise<Revert[]> {
    if (this.unloaded) return [];
    const s = this.settings;
    const out: Revert[] = [];
    this.applying = true;
    try {
      const vault = this.app.vault;
      if (typeof vault.getConfig === "function" && typeof vault.setConfig === "function")
        for (const rule of CONFIG_RULES) {
          const value = rule.value(s);
          if (!s[rule.setting] || !value || vault.getConfig(rule.key) === value || skip(rule.key)) continue;
          vault.setConfig(rule.key, value);
          out.push({ id: rule.key, what: rule.what(value), setting: rule.setting });
        }
      if (s.forceCorePlugins)
        for (const [id, what] of await this.applyCorePlugins(skip)) out.push({ id, what, setting: "forceCorePlugins" });
      if (s.forceHotkeys)
        for (const [id, what] of await this.applyHotkeys(skip)) out.push({ id, what, setting: "forceHotkeys" });
    } finally {
      this.applying = false;
    }
    if (this.dirty) {
      this.dirty = false;
      this.requestEnforce();
    }
    return out;
  }

  /**
   * "Enforces vault settings on every device, on load and whenever they drift": a change made by hand (Settings →
   * Files and links, Core plugins, Hotkeys), by a synced app.json / hotkeys.json, or by another plugin is put
   * back, with a notice that names the Editor Defaults (Archit) setting to turn off for changing it.
   */
  private watchDrift() {
    this.registerEvent(
      this.app.vault.on("config-changed", (key: string) => {
        if (ENFORCED_CONFIG.has(key)) this.requestEnforce();
      }),
    );
    const core = this.app.internalPlugins;
    if (typeof core?.on === "function") this.registerEvent(core.on("change", () => this.requestEnforce()));
    const hm = this.app.hotkeyManager;
    const plugin = this;
    // the Hotkeys tab saves after each change
    if (hm && typeof hm.save === "function")
      this.register(
        around(hm, {
          save: next =>
            function (this: unknown, ...args: unknown[]) {
              const saved: unknown = next ? Reflect.apply(next, this, args) : undefined;
              void Promise.resolve(saved).then(
                () => plugin.requestEnforce(),
                () => undefined,
              );
              return saved instanceof Promise ? saved : Promise.resolve();
            },
        }),
      );
    // a hotkeys.json changed on disk (sync) is loaded again by Obsidian 50 ms later; the check comes after that
    const hotkeysFile = `${this.app.vault.configDir}/hotkeys.json`;
    this.registerEvent(
      this.app.vault.on("raw", (path: string) => {
        if (path === hotkeysFile) this.requestEnforce();
      }),
    );
  }

  private requestEnforce() {
    if (this.unloaded) return;
    if (this.applying) {
      this.dirty = true;
      return;
    }
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    this.driftTimer = window.setTimeout(() => {
      this.driftTimer = null;
      this.enforce().catch(logError("could not put the defaults back"));
    }, DRIFT_DELAY_MS);
  }

  private async enforce() {
    if (this.unloaded) return;
    // something else that keeps setting one back (another plugin or device) would make the two fight forever
    const refused = new Set<string>();
    const reverted = await this.applyDefaults(id => {
      if (this.guard.allow(id, Date.now())) return false;
      refused.add(id);
      return true;
    });
    if (this.unloaded) return;
    const now = Date.now();
    for (const r of reverted) this.guard.record(r.id, now);
    this.scheduleRecheck(refused, now);
    this.warnHotkeyClashes();
    const stopped = this.guard.takeStopped();
    if (stopped.length) new Notice(stoppedNotice(stopped.map(id => this.describe(id))), 15000);
    if (!reverted.length) return;
    new Notice(
      revertNotice(
        reverted.map(r => r.what),
        reverted.map(r => SETTING_NAMES[r.setting]),
      ),
      8000,
    );
    // an open Settings tab that shows these values still shows the one just undone
    const tab = this.openSettingsTab();
    if (!tab || !REDRAWN_TABS.has(tab.id ?? "")) return;
    // the Hotkeys tab redraws its list and keeps its filter; the others are drawn again where they were scrolled
    if (typeof tab.onHotkeysChanged === "function") tab.onHotkeysChanged();
    else if (typeof tab.display === "function") {
      const top = tab.containerEl?.scrollTop ?? 0;
      tab.display();
      if (tab.containerEl) tab.containerEl.scrollTop = top;
    }
  }

  private openSettingsTab() {
    return this.app.setting?.isOpen ? (this.app.setting.activeTab ?? null) : null;
  }

  /** An item the guard refused is checked again once its window has passed, even if nothing else changes by then. */
  private scheduleRecheck(refused: ReadonlySet<string>, now: number) {
    const at = Math.min(...[...refused].map(id => this.guard.retryAt(id, now) ?? Infinity));
    if (!Number.isFinite(at) || (this.recheckTimer !== null && this.recheckAt <= at)) return;
    if (this.recheckTimer !== null) window.clearTimeout(this.recheckTimer);
    this.recheckAt = at;
    this.recheckTimer = window.setTimeout(
      () => {
        this.recheckTimer = null;
        this.requestEnforce();
      },
      Math.max(0, at - now) + 50,
    );
  }

  /** An enforced item (config key, core plugin or command) as a notice names it. */
  private describe(id: string): string {
    const rule = CONFIG_RULES.find(r => r.key === id);
    if (rule) return rule.what(rule.value(this.settings));
    const core = ENFORCED.corePlugins.find(r => r.id === id);
    return core ? `core plugin ${core.name}` : `the hotkeys of "${this.commandName(id)}"`;
  }

  /** A command's name: its own, or the one in defaults.json while its plugin isn't loaded. */
  private commandName(id: string): string {
    return this.app.commands?.findCommand?.(id)?.name ?? HOTKEY_NAMES[id] ?? id;
  }

  /**
   * Warns (once per clash per session) when another command has one of the hotkeys set here (Alt+N, Navigate
   * back / forward): Obsidian runs only one of them. The other command's hotkey is left alone. A hotkey whose
   * command doesn't exist (Templater not installed) clashes with nothing.
   */
  private warnHotkeyClashes() {
    const hm = this.app.hotkeyManager;
    if (this.unloaded || !this.settings.forceHotkeys || !hm) return;
    // editor commands are only in `commands` while an editor has focus; `editorCommands` always has them
    const commands = { ...this.app.commands?.editorCommands, ...this.app.commands?.commands };
    const effective: Record<string, Hotkey[]> = {};
    for (const id of Object.keys(commands)) effective[id] = hm.getHotkeys?.(id) ?? hm.getDefaultHotkeys?.(id) ?? [];
    for (const c of hotkeyClashes(effective, Platform.isMacOS || Platform.isIosApp)) {
      const key = `${c.other}|${c.label}`;
      if (this.warnedClashes.has(key)) continue;
      this.warnedClashes.add(key);
      const name = (id: string) => this.app.commands?.findCommand?.(id)?.name ?? commands[id]?.name ?? id;
      new Notice(
        `Editor Defaults (Archit): ${c.label} (${name(c.command)}) is also the hotkey of "${name(c.other)}", so it may run ` +
          `that instead. Change or remove one of them in Settings → Hotkeys.`,
        10000,
      );
    }
  }

  /** Sets each command in HOTKEYS to exactly its listed hotkeys (written to .obsidian/hotkeys.json). */
  private async applyHotkeys(skip: (id: string) => boolean): Promise<[string, string][]> {
    const hm = this.app.hotkeyManager;
    if (typeof hm?.setHotkeys !== "function" || typeof hm.getHotkeys !== "function") return [];
    const changed: [string, string][] = [];
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      const now = hm.getHotkeys(id);
      // no entry at all means the command's default hotkeys (Templater's own, say): write the list explicitly
      if ((now !== undefined && sameHotkeys(now, keys)) || skip(id)) continue;
      hm.setHotkeys(
        id,
        keys.map(k => ({ modifiers: [...k.modifiers], key: k.key })),
      );
      changed.push([id, `the hotkeys of "${this.commandName(id)}"`]);
    }
    if (changed.length) {
      try {
        await hm.save?.();
      } catch (e) {
        console.error("[editor-defaults] could not save hotkeys", e);
      }
    }
    return changed;
  }

  /** Whether a community plugin is loaded (installed and enabled). */
  private isPluginLoaded(id: string): boolean {
    return !!this.app.plugins?.plugins?.[id];
  }

  /** Turns the core plugins on or off as the rules say for the plugins loaded now (wantedCorePlugins). */
  private async applyCorePlugins(skip: (id: string) => boolean): Promise<[string, string][]> {
    const plugins = this.app.internalPlugins?.plugins;
    if (!plugins) return [];
    const changed: [string, string][] = [];
    for (const [id, want] of Object.entries(wantedCorePlugins(p => this.isPluginLoaded(p)))) {
      const p = plugins[id];
      const turn = want ? p?.enable : p?.disable;
      if (!p || p.enabled === want || typeof turn !== "function" || skip(id)) continue;
      try {
        await turn.call(p, true);
        changed.push([id, `core plugin ${p.instance?.name ?? id} ${want ? "on" : "off"}`]);
      } catch (e) {
        console.error(`[editor-defaults] could not turn core plugin ${id} ${want ? "on" : "off"}`, e);
      }
    }
    return changed;
  }

  /**
   * Redraws every Date / Date & time property field (notes in tabs, cards and canvases, the File properties view,
   * Bases tabs), so turning "Dates in properties" on or off, or the plugin, shows at once. Obsidian redraws a
   * property everywhere when its type changes ("changed" on the metadata type manager); nothing is saved.
   */
  private rerenderDateFields() {
    const mtm = this.app.metadataTypeManager;
    if (!mtm || typeof mtm.trigger !== "function") return;
    const props = mtm.getAllProperties?.() ?? {};
    for (const [key, info] of Object.entries(props))
      if (info?.widget === "date" || info?.widget === "datetime") mtm.trigger("changed", key);
    // a Bases tab keeps its cells: build it again (its query, view and scroll come back from its state)
    for (const leaf of this.app.workspace.getLeavesOfType("bases"))
      leaf.rebuildView?.()?.catch(logError("could not redraw a Bases tab"));
  }

  /** Date / Date & time property widgets: ISO text fields (see properties.ts). Undone on unload. */
  private patchDateWidgets() {
    const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
    if (!widgets) return;
    const plugin = this;
    const types: IsoType[] = ["date", "datetime"];
    for (const type of types) {
      const w = widgets[type];
      if (typeof w?.render !== "function") continue;
      this.register(
        around(w, {
          render: next =>
            function (this: unknown, el: HTMLElement, ...rest: unknown[]) {
              const widget: unknown = next ? Reflect.apply(next, this, [el, ...rest]) : undefined;
              if (plugin.settings.isoDates) {
                try {
                  isoifyWidget(type, widget, el);
                } catch (e) {
                  console.error("[editor-defaults] could not change the date field", e);
                }
              }
              return widget;
            },
        }),
      );
    }
  }

  /**
   * What to change in a link just picked from a [[ dropdown: the note name Obsidian adds as an alias to a note
   * pick, and, for a heading or block pick (where Obsidian keeps the note name as typed), the path from the
   * vault root when new links use it.
   */
  private pickFix(raw: unknown, sourcePath: string): PickFix {
    const fix: PickFix = {};
    const item = linkSuggestion(raw);
    const file = item.file;
    if (!file) return fix;
    if (item.type === "file" && this.settings.stripAlias) fix.dropAlias = file.basename;
    if (
      (item.type === "heading" || item.type === "block") &&
      this.settings.forceRootPaths &&
      this.app.vault.getConfig?.("newLinkFormat") === "absolute"
    )
      fix.path = this.app.metadataCache.fileToLinktext(file, sourcePath, true);
    return fix;
  }

  /** Wraps selectSuggestion on Obsidian's own [[ link suggester in the editor (undone on unload). */
  private patchLinkSuggest() {
    const suggest = (this.app.workspace.editorSuggest?.suggests ?? []).find(isCoreLinkSuggest);
    if (!suggest) {
      console.warn("[editor-defaults] Obsidian's [[ link suggester wasn't found: picked links keep their alias");
      return;
    }
    const plugin = this;
    this.register(
      around(suggest, {
        selectSuggestion: next =>
          function (this: EditorSuggest<unknown>, item: unknown, ...rest: unknown[]) {
            // the context is gone once the suggestion is taken
            const ctx = this.context;
            const editor = ctx?.editor;
            // only a pick opened by [[ or ![[ (the query starts right after it)
            const before =
              ctx && editor
                ? editor.getRange({ line: ctx.start.line, ch: Math.max(0, ctx.start.ch - 2) }, ctx.start)
                : "";
            const fix = isLinkTrigger(before) ? plugin.pickFix(item, ctx?.file?.path ?? "") : {};
            const result: unknown = Reflect.apply(next, this, [item, ...rest]);
            if (editor && (fix.dropAlias !== undefined || fix.path !== undefined)) fixLinkAtCursor(editor, fix);
            return result;
          },
      }),
    );
  }

  /**
   * The [[ suggester in property values is created per field, from a class Obsidian doesn't export. It is an
   * AbstractInputSuggest that shows its suggestions through the base class, so its prototype is patched the
   * first time one shows (undone on unload).
   */
  private patchPropertyLinkSuggest() {
    const plugin = this;
    const patched = new Set<PropertyLinkSuggestProto>();
    const patchProto = (proto: PropertyLinkSuggestProto) => {
      patched.add(proto);
      this.register(
        around(proto, {
          selectSuggestion: next =>
            function (this: PropertyLinkSuggest, item: unknown, ...rest: unknown[]) {
              const fix = plugin.pickFix(item, this.sourcePath ?? "");
              if (fix.dropAlias === undefined && fix.path === undefined) {
                Reflect.apply(next, this, [item, ...rest]);
                return;
              }
              const apply = (text: string, ch: number) => {
                const r = fixPickedLink(text, ch, fix);
                return r ? { text: text.slice(0, r.from) + r.text + text.slice(r.to), ch: r.ch } : null;
              };
              // Enter / click: the finished text goes to onSelectLink
              const onSelect = this.onSelectLink;
              let committed = false;
              if (typeof onSelect === "function")
                this.onSelectLink = (text: string, e: unknown) => {
                  committed = true;
                  onSelect.call(this, apply(text, text.length)?.text ?? text, e);
                };
              try {
                Reflect.apply(next, this, [item, ...rest]);
              } finally {
                this.onSelectLink = onSelect;
              }
              // Tab, # or ^: the text is in the field, with the dropdown still open
              if (!committed) fixFieldLink(this.inputEl, apply);
            },
        }),
      );
    };
    // showSuggestions is declared in types/obsidian.d.ts (PopoverSuggest's, not in the public API)
    const base: AbstractInputSuggest<unknown> = AbstractInputSuggest.prototype;
    this.register(
      around(base, {
        showSuggestions: next =>
          function (this: AbstractInputSuggest<unknown>, ...args: unknown[]) {
            try {
              const proto: unknown = Object.getPrototypeOf(this);
              if (
                isPropertyLinkSuggestProto(proto) &&
                !patched.has(proto) &&
                "onSelectLink" in this &&
                typeof this.onSelectLink === "function"
              )
                patchProto(proto);
            } catch (e) {
              console.error("[editor-defaults] could not patch the property link suggester", e);
            }
            Reflect.apply(next, this, args);
          },
      }),
    );
  }
}

/** Applies `fix` to the link around the cursor, keeping the cursor at the same place in it. */
function fixLinkAtCursor(editor: Editor, fix: PickFix) {
  const cursor = editor.getCursor();
  const r = fixPickedLink(editor.getLine(cursor.line), cursor.ch, fix);
  if (!r) return;
  editor.replaceRange(r.text, { line: cursor.line, ch: r.from }, { line: cursor.line, ch: r.to });
  editor.setCursor({ line: cursor.line, ch: r.ch });
}

/** The same for a property's contenteditable field (plain text), then lets Obsidian's suggester update. */
function fixFieldLink(el: HTMLElement, apply: (text: string, ch: number) => { text: string; ch: number } | null) {
  const text = el.textContent ?? "";
  const sel = el.win.getSelection();
  let ch = text.length;
  if (sel && sel.focusNode && el.contains(sel.focusNode)) {
    const range = el.doc.createRange();
    range.setStart(el, 0);
    range.setEnd(sel.focusNode, sel.focusOffset);
    ch = range.toString().length;
  }
  const r = apply(text, ch);
  if (!r) return;
  el.textContent = r.text;
  if (sel && el.firstChild) sel.collapse(el.firstChild, r.ch);
  el.dispatchEvent(new Event("input"));
}
