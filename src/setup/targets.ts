// Where each kind of block's settings live in the vault, and how to read, compare and write them while Obsidian
// runs. A Target turns one block kind into JSON the pure code (json.ts) can diff, merge and capture.
import type { App, Hotkey } from "obsidian";
import { formatHotkey, normalHotkeys, parseHotkey } from "./hotkeys";
import { Defaults, isObject, Json, JsonObject, merged, toJson } from "./json";
import { wantedCorePlugins } from "./model";

export interface Target {
  /** The block key it serves ("app", "core-plugins", "hotkeys", "property-types", "config:canvas", "plugin:<id>"). */
  key: string;
  /** What a notice calls one of its settings ("Obsidian setting newLinkFormat", "Templater setting x"). */
  name(path: string): string;
  /** What the vault holds now. */
  read(): Promise<JsonObject>;
  /** The values the vault should hold for a block's settings (core plugins: rules with onlyWith resolved). */
  wanted(settings: JsonObject): JsonObject;
  defaults?: Defaults;
  /** Makes the vault hold `values` at `paths` (paths where it differs now). */
  write(values: JsonObject, paths: readonly string[]): Promise<void>;
}

const top = (paths: readonly string[]) => [...new Set(paths.map(p => p.split(".")[0]))];

/** A JSON file of the vault as an object ({} when it's missing or isn't one). */
export async function readJsonFile(app: App, path: string): Promise<JsonObject> {
  try {
    if (!(await app.vault.adapter.exists(path))) return {};
    const v = toJson(JSON.parse(await app.vault.adapter.read(path)));
    return isObject(v) ? v : {};
  } catch {
    return {};
  }
}

/** Written the way Obsidian writes its config and plugin data (two-space JSON). */
export async function writeJsonFile(app: App, path: string, value: JsonObject): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir && !(await app.vault.adapter.exists(dir))) await app.vault.adapter.mkdir(dir);
  await app.vault.adapter.write(path, JSON.stringify(value, null, 2));
}

/** Obsidian's names for the app settings a note usually sets (others are named by their key). */
const APP_NAMES: Record<string, string> = {
  newLinkFormat: "New link format",
  attachmentFolderPath: "Default location for new attachments",
  trashOption: "Deleted files",
  alwaysUpdateLinks: "Automatically update internal links",
  showUnsupportedFiles: "Detect all file extensions",
  newFileLocation: "Default location for new notes",
  newFileFolderPath: "Folder to create new notes in",
};

/** app.json and appearance.json (Obsidian holds them as one config). */
export function appTarget(app: App): Target {
  const vault = app.vault;
  /** A key's default: what getConfig gives while the key isn't set (read without any event or save). */
  const defaultOf = (key: string): Json | undefined => {
    const cfg = vault.config;
    if (!cfg || typeof vault.getConfig !== "function") return undefined;
    const had = Object.hasOwn(cfg, key);
    const value = cfg[key];
    delete cfg[key];
    try {
      return toJson(vault.getConfig(key));
    } finally {
      if (had) cfg[key] = value;
    }
  };
  return {
    key: "app",
    name: p => `"${APP_NAMES[p] ?? p}"`,
    read: () => {
      const v = toJson(vault.config ?? {});
      return Promise.resolve(isObject(v) ? v : {});
    },
    wanted: s => s,
    defaults: path => {
      const [k, ...rest] = path.split(".");
      let v = defaultOf(k);
      for (const r of rest) v = isObject(v) ? v[r] : undefined;
      return v;
    },
    write: (values, paths) => {
      for (const k of top(paths)) {
        const v = values[k];
        const now = toJson(vault.getConfig?.(k));
        vault.setConfig?.(k, isObject(v) && isObject(now) ? merged(now, v) : v);
      }
      return Promise.resolve();
    },
  };
}

/** Core plugins on or off. */
export function corePluginsTarget(app: App, isLoaded: (id: string) => boolean): Target {
  const plugins = () => app.internalPlugins?.plugins ?? {};
  return {
    key: "core-plugins",
    name: id => `core plugin ${plugins()[id]?.instance?.name ?? id}`,
    read: () => Promise.resolve(Object.fromEntries(Object.entries(plugins()).map(([id, p]) => [id, p.enabled]))),
    wanted: s => wantedCorePlugins(s, isLoaded),
    // a core plugin that doesn't say is off in a new vault
    defaults: id => (plugins()[id] ? (plugins()[id]?.instance?.defaultOn ?? false) : undefined),
    write: async (values, paths) => {
      for (const id of top(paths)) {
        const p = plugins()[id];
        const on = values[id] === true;
        const turn = on ? p?.enable : p?.disable;
        if (!p || p.enabled === on || typeof turn !== "function") continue;
        try {
          await turn.call(p, true);
        } catch (e) {
          console.error(`[editor-defaults] could not turn core plugin ${id} ${on ? "on" : "off"}`, e);
        }
      }
    },
  };
}

/** Hotkeys (hotkeys.json), as strings: "Mod+Alt+ArrowLeft". */
export function hotkeysTarget(app: App, commandName: (id: string) => string): Target {
  const hm = () => app.hotkeyManager;
  const strings = (keys: readonly Hotkey[]) => keys.map(formatHotkey);
  return {
    key: "hotkeys",
    name: id => `the hotkeys of "${commandName(id)}"`,
    read: () => {
      const custom = hm()?.customKeys ?? {};
      return Promise.resolve(Object.fromEntries(Object.entries(custom).map(([id, keys]) => [id, strings(keys)])));
    },
    wanted: s =>
      Object.fromEntries(
        Object.entries(s).flatMap(([id, v]) => {
          const n = Array.isArray(v) && v.every(k => typeof k === "string") ? normalHotkeys(v) : null;
          return n ? [[id, n]] : [];
        }),
      ),
    defaults: id => strings(hm()?.getDefaultHotkeys?.(id) ?? []),
    write: async (values, paths) => {
      const m = hm();
      if (typeof m?.setHotkeys !== "function") return;
      for (const id of top(paths)) {
        const v = values[id];
        if (!Array.isArray(v)) continue;
        m.setHotkeys(
          id,
          v.flatMap(k => {
            const h = typeof k === "string" ? parseHotkey(k) : null;
            return h ? [h] : [];
          }),
        );
      }
      try {
        await m.save?.();
      } catch (e) {
        console.error("[editor-defaults] could not save hotkeys", e);
      }
    },
  };
}

/** Property types (types.json). */
export function propertyTypesTarget(app: App): Target {
  const file = () => `${app.vault.configDir}/types.json`;
  return {
    key: "property-types",
    name: p => `the type of property ${p}`,
    read: async () => {
      const t = (await readJsonFile(app, file())).types;
      return isObject(t) ? t : {};
    },
    wanted: s => s,
    write: async (values, paths) => {
      const mtm = app.metadataTypeManager;
      for (const name of top(paths)) {
        const w = values[name];
        if (typeof w === "string") await mtm?.setType?.(name, w);
      }
    },
  };
}

/** Another config file, `.obsidian/<name>.json` (a core plugin's settings, such as canvas.json). */
export function configFileTarget(app: App, name: string): Target {
  const file = () => `${app.vault.configDir}/${name}.json`;
  return {
    key: `config:${name}`,
    name: p => `${p} in ${name}.json`,
    read: () => readJsonFile(app, file()),
    wanted: s => s,
    write: async values => {
      const all = merged(await readJsonFile(app, file()), values);
      await writeJsonFile(app, file(), all);
      const core = app.internalPlugins?.plugins?.[name]?.instance;
      if (typeof core?.onExternalSettingsChange === "function") await core.onExternalSettingsChange();
      else if (isObject(core?.options)) Object.assign(core.options, all);
    },
  };
}

/** What the vault setup needs to know about a community plugin's instance. */
interface LoadedPlugin {
  onExternalSettingsChange?: () => unknown;
}
const asLoaded = (p: unknown): LoadedPlugin | null => (typeof p === "object" && p !== null ? p : null);

/** A community plugin's data.json. The plugin's own (Editor Defaults) is applied by `writeSelf`. */
export function pluginTarget(
  app: App,
  id: string,
  opts: { selfId: string; defaults?: JsonObject; writeSelf(all: JsonObject): Promise<void> },
): Target {
  const plugins = () => app.plugins;
  const dir = () => plugins()?.manifests?.[id]?.dir ?? `${app.vault.configDir}/plugins/${id}`;
  const file = () => `${dir()}/data.json`;
  const pluginName = () => plugins()?.manifests?.[id]?.name ?? id;
  return {
    key: `plugin:${id}`,
    name: p => `${pluginName()} setting ${p}`,
    read: () => readJsonFile(app, file()),
    wanted: s => s,
    ...(opts.defaults ? { defaults: opts.defaults } : {}),
    write: async values => {
      const all = merged(await readJsonFile(app, file()), values);
      if (id === opts.selfId) return opts.writeSelf(all);
      const pm = plugins();
      if (!pm?.manifests?.[id]) return; // not installed: the install writes its settings
      const loaded = asLoaded(pm.plugins?.[id]);
      if (loaded && typeof loaded.onExternalSettingsChange === "function") {
        await writeJsonFile(app, file(), all);
        await loaded.onExternalSettingsChange();
      } else if (loaded) {
        // it would save its old settings over the file: off, write, on (community-plugins.json unchanged)
        await pm.disablePlugin?.(id);
        await writeJsonFile(app, file(), all);
        await pm.enablePlugin?.(id);
      } else await writeJsonFile(app, file(), all);
    },
  };
}
