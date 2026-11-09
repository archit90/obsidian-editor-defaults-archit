// The settings note's blocks, checked and typed: what the vault setup applies. Pure: YAML parsing is passed in
// (Obsidian's parseYaml in the plugin, the `yaml` package in unit tests).
import { normalHotkeys } from "./hotkeys";
import { findBlocks, NoteBlock } from "./note";
import { isObject, JsonObject, toJson } from "./json";

export type Only = "desktop" | "mobile";
export type PluginState = "enabled" | "disabled" | "uninstalled";
export type Source = { type: "community" } | { type: "github"; repo: string };

interface Base {
  /** The block in the note (where it is, its heading). */
  at: NoteBlock;
  only?: Only;
  settings: JsonObject;
}

/** `plugin: <id>`: a community plugin, where it comes from, whether it's on, and its settings. */
export interface PluginBlock extends Base {
  kind: "plugin";
  id: string;
  source: Source;
  state: PluginState;
  /** A pinned release; otherwise the latest. */
  version?: string;
  /** Top-level settings keys never taken from the plugin into the note. */
  ignore: string[];
}

/** The Obsidian settings a block can hold: app.json and appearance.json, core plugins, hotkeys, property types. */
export const OBSIDIAN_TARGETS = ["app", "core-plugins", "hotkeys", "property-types"] as const;
export type ObsidianTarget = (typeof OBSIDIAN_TARGETS)[number];

/** `obsidian: app | core-plugins | hotkeys | property-types`, or `obsidian: <name>` for `.obsidian/<name>.json`. */
export interface ObsidianBlock extends Base {
  kind: "obsidian";
  target: ObsidianTarget | `config:${string}`;
}

export type Block = PluginBlock | ObsidianBlock;

export interface BlockError {
  at: NoteBlock;
  message: string;
}

export interface Note {
  blocks: Block[];
  errors: BlockError[];
}

/** Config files a block can't name: Obsidian's own, held by the blocks above, or the workspace (per device). */
const RESERVED = new Set([
  "app",
  "appearance",
  "community-plugins",
  "core-plugins",
  "core-plugins-migration",
  "hotkeys",
  "types",
  "workspace",
  "workspace-mobile",
  "workspaces",
  "graph",
]);

/** Whether `.obsidian/<name>.json` is one no `obsidian: <name>` block can hold. */
export function isReservedConfig(name: string): boolean {
  return RESERVED.has(name) || name.startsWith("workspace");
}

const ID = /^[a-z0-9][a-z0-9._-]*$/i;
const REPO = /^[\w.-]+\/[\w.-]+$/;

/** The key of the thing a block sets ("plugin:dataview", "app", "config:canvas"): two blocks can't share one. */
export function blockKey(b: Block): string {
  return b.kind === "plugin" ? `plugin:${b.id}` : b.target;
}

/** Checks a core-plugins block's values: on/off, or { enabled, onlyWith: <community plugin id> }. */
function checkCorePlugins(settings: JsonObject): string | null {
  for (const [id, v] of Object.entries(settings)) {
    if (typeof v === "boolean") continue;
    if (isObject(v) && typeof v.enabled === "boolean" && (v.onlyWith === undefined || typeof v.onlyWith === "string"))
      continue;
    return `core plugin "${id}": true, false, or { enabled: true/false, onlyWith: <plugin id> }`;
  }
  return null;
}

function checkHotkeys(settings: JsonObject): string | null {
  for (const [id, v] of Object.entries(settings)) {
    if (!Array.isArray(v) || !v.every((k): k is string => typeof k === "string") || !normalHotkeys(v))
      return `hotkeys of "${id}": a list like [Mod+Alt+ArrowLeft, "Mod+["] ([] for none)`;
  }
  return null;
}

function checkTypes(settings: JsonObject): string | null {
  for (const [name, v] of Object.entries(settings))
    if (typeof v !== "string" || !v) return `property "${name}": a type such as text, date, datetime, multitext`;
  return null;
}

/** One block's parsed YAML as a Block, or the reason it isn't one. */
export function parseBlock(value: unknown, at: NoteBlock): Block | BlockError {
  const fail = (message: string): BlockError => ({ at, message });
  if (!isObject(toJson(value))) return fail("the block must be a YAML mapping (key: value lines)");
  const v = toJson(value);
  if (!isObject(v)) return fail("the block must be a YAML mapping");
  const settings = v.settings ?? {};
  if (!isObject(settings)) return fail("settings: must be a mapping (key: value lines)");
  let only: Only | undefined;
  if (v.only !== undefined) {
    if (v.only !== "desktop" && v.only !== "mobile") return fail("only: desktop or mobile");
    only = v.only;
  }
  if (typeof v.plugin === "string") {
    if (!ID.test(v.plugin)) return fail(`plugin: "${v.plugin}" isn't a plugin id`);
    let source: Source = { type: "community" };
    if (v.source !== undefined && v.source !== "community") {
      const m = typeof v.source === "string" ? /^github:(.+)$/.exec(v.source) : null;
      if (!m || !REPO.test(m[1])) return fail("source: community, or github:<owner>/<repo>");
      source = { type: "github", repo: m[1] };
    }
    const state = v.state ?? "enabled";
    if (state !== "enabled" && state !== "disabled" && state !== "uninstalled")
      return fail("state: enabled, disabled or uninstalled");
    if (v.version !== undefined && typeof v.version !== "string")
      return fail('version: a release, in quotes ("1.2.3")');
    const ignore = v.ignore ?? [];
    if (!Array.isArray(ignore) || !ignore.every((k): k is string => typeof k === "string"))
      return fail("ignore: a list of settings keys");
    return {
      kind: "plugin",
      id: v.plugin,
      source,
      state,
      ...(typeof v.version === "string" ? { version: v.version } : {}),
      ignore,
      at,
      ...(only ? { only } : {}),
      settings,
    };
  }
  if (typeof v.obsidian === "string") {
    const name = v.obsidian;
    let target: ObsidianBlock["target"];
    if ((OBSIDIAN_TARGETS as readonly string[]).includes(name)) {
      target = name as ObsidianTarget; // checked against OBSIDIAN_TARGETS on the line above
      const err =
        target === "core-plugins"
          ? checkCorePlugins(settings)
          : target === "hotkeys"
            ? checkHotkeys(settings)
            : target === "property-types"
              ? checkTypes(settings)
              : null;
      if (err) return fail(err);
    } else if (ID.test(name) && !isReservedConfig(name)) target = `config:${name}`;
    else return fail(`obsidian: ${OBSIDIAN_TARGETS.join(", ")}, or the name of a config file (canvas…)`);
    return { kind: "obsidian", target, at, ...(only ? { only } : {}), settings };
  }
  return fail("a block starts with plugin: <id> or obsidian: <what>");
}

/** Every block of the note, checked. A block that doesn't parse, or sets what an earlier one set, is an error. */
export function readNote(text: string, parseYaml: (yaml: string) => unknown): Note {
  const blocks: Block[] = [];
  const errors: BlockError[] = [];
  const seen = new Set<string>();
  for (const at of findBlocks(text)) {
    let value: unknown;
    try {
      value = parseYaml(at.yaml);
    } catch (e) {
      errors.push({ at, message: `YAML: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
      continue;
    }
    const b = parseBlock(value, at);
    if (!("kind" in b)) {
      errors.push(b);
      continue;
    }
    const key = blockKey(b);
    if (seen.has(key)) {
      errors.push({ at, message: `${key.replace(/^config:/, "")} is set by an earlier block already` });
      continue;
    }
    seen.add(key);
    blocks.push(b);
  }
  return { blocks, errors };
}

/** Whether a block applies on this device. */
export function appliesHere(b: Block, isMobile: boolean): boolean {
  return !b.only || (b.only === "mobile") === isMobile;
}

/** The core plugins to keep on or off now: a rule with onlyWith counts only while that plugin is loaded. */
export function wantedCorePlugins(settings: JsonObject, isLoaded: (id: string) => boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(settings)) {
    if (typeof v === "boolean") out[id] = v;
    else if (isObject(v) && typeof v.enabled === "boolean") {
      if (typeof v.onlyWith === "string" && !isLoaded(v.onlyWith)) continue;
      out[id] = v.enabled;
    }
  }
  return out;
}

/** The YAML object a block is written back as, with new settings (key order: what, where from, state, settings). */
export function blockValue(b: Block, settings: JsonObject): JsonObject {
  const out: JsonObject = {};
  if (b.kind === "plugin") {
    out.plugin = b.id;
    out.source = b.source.type === "github" ? `github:${b.source.repo}` : "community";
    if (b.state !== "enabled") out.state = b.state;
    if (b.version) out.version = b.version;
    if (b.ignore.length) out.ignore = b.ignore;
  } else out.obsidian = b.target.replace(/^config:/, "");
  if (b.only) out.only = b.only;
  out.settings = settings;
  return out;
}
