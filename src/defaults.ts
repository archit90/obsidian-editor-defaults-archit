// What Editor Defaults (Archit) enforces. The values live in defaults.json, the one list of them: this module reads
// it (checked, typed) for the plugin, and the e2e suite reads the same file to check a vault against it.
import type { Hotkey, Modifier } from "obsidian";
import RAW from "./defaults.json";
import type { BoolKey, Settings } from "./settings";

/** A core plugin kept on or off; `onlyWith`: only while that community plugin is loaded (it replaces this one). */
export interface CorePluginRule {
  id: string;
  name: string;
  enabled: boolean;
  onlyWith?: { id: string; name: string };
}

/** A command and exactly the hotkeys it should have (they replace Obsidian's defaults for it, so those are listed). */
export interface HotkeyRule {
  command: string;
  /** The command's name, for notices while its plugin isn't installed (its own name otherwise). */
  name: string;
  keys: Hotkey[];
}

export interface EnforcedDefaults {
  /** The default of the "Attachment folder" setting. */
  attachmentFolder: string;
  /** app.json values: newLinkFormat, trashOption. */
  config: { newLinkFormat: string; trashOption: string };
  corePlugins: CorePluginRule[];
  hotkeys: HotkeyRule[];
}

const MODIFIERS: readonly string[] = ["Mod", "Ctrl", "Meta", "Shift", "Alt"] satisfies Modifier[];
const isModifier = (m: unknown): m is Modifier => typeof m === "string" && MODIFIERS.includes(m);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || v === "") throw new Error(`defaults.json: ${what} must be a non-empty string`);
  return v;
};

function parseHotkey(v: unknown, what: string): Hotkey {
  if (!isRecord(v) || !Array.isArray(v.modifiers) || !v.modifiers.every(isModifier))
    throw new Error(`defaults.json: ${what} needs modifiers from ${MODIFIERS.join(", ")}`);
  return { modifiers: [...v.modifiers], key: str(v.key, `${what}.key`) };
}

/** defaults.json, checked: a mistake in it fails the unit tests and the plugin's load, never half-applies. */
export function parseDefaults(raw: unknown): EnforcedDefaults {
  if (!isRecord(raw) || !isRecord(raw.config)) throw new Error("defaults.json: no config");
  if (!Array.isArray(raw.corePlugins) || !Array.isArray(raw.hotkeys))
    throw new Error("defaults.json: corePlugins and hotkeys must be lists");
  const corePlugins = raw.corePlugins.map((r: unknown, i): CorePluginRule => {
    if (!isRecord(r) || typeof r.enabled !== "boolean") throw new Error(`defaults.json: corePlugins[${i}]`);
    const rule: CorePluginRule = {
      id: str(r.id, `corePlugins[${i}].id`),
      name: str(r.name, `corePlugins[${i}].name`),
      enabled: r.enabled,
    };
    if (r.onlyWith !== undefined) {
      if (!isRecord(r.onlyWith)) throw new Error(`defaults.json: corePlugins[${i}].onlyWith`);
      rule.onlyWith = {
        id: str(r.onlyWith.id, `corePlugins[${i}].onlyWith.id`),
        name: str(r.onlyWith.name, `corePlugins[${i}].onlyWith.name`),
      };
    }
    return rule;
  });
  const hotkeys = raw.hotkeys.map((h: unknown, i): HotkeyRule => {
    if (!isRecord(h) || !Array.isArray(h.keys)) throw new Error(`defaults.json: hotkeys[${i}]`);
    return {
      command: str(h.command, `hotkeys[${i}].command`),
      name: str(h.name, `hotkeys[${i}].name`),
      keys: h.keys.map((k: unknown, j) => parseHotkey(k, `hotkeys[${i}].keys[${j}]`)),
    };
  });
  return {
    attachmentFolder: str(raw.attachmentFolder, "attachmentFolder"),
    config: {
      newLinkFormat: str(raw.config.newLinkFormat, "config.newLinkFormat"),
      trashOption: str(raw.config.trashOption, "config.trashOption"),
    },
    corePlugins,
    hotkeys,
  };
}

const raw: unknown = RAW;
export const ENFORCED: EnforcedDefaults = parseDefaults(raw);

/** Command id -> the hotkeys it should have. */
export const HOTKEYS: Readonly<Record<string, readonly Hotkey[]>> = Object.fromEntries(
  ENFORCED.hotkeys.map(h => [h.command, h.keys]),
);

/** Command id -> its name, for notices about a command whose plugin isn't loaded. */
export const HOTKEY_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  ENFORCED.hotkeys.map(h => [h.command, h.name]),
);

/**
 * Core plugin id -> the state to keep, for the community plugins loaded now: a rule with `onlyWith` applies only
 * while that plugin is loaded (Templates off while Templater is, Backlinks off while Backlinks Full View is).
 */
export function wantedCorePlugins(isLoaded: (pluginId: string) => boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const r of ENFORCED.corePlugins) if (!r.onlyWith || isLoaded(r.onlyWith.id)) out[r.id] = r.enabled;
  return out;
}

/** Whether two hotkey lists are the same, ignoring modifier order and key case. */
export function sameHotkeys(a: readonly Hotkey[] | undefined, b: readonly Hotkey[] | undefined): boolean {
  const norm = (ks: readonly Hotkey[] | undefined) =>
    JSON.stringify((ks ?? []).map(k => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
  return norm(a) === norm(b);
}

/** A hotkey of another command that is the same key as one Editor Defaults sets. */
export interface HotkeyClash {
  /** The enforced command (in HOTKEYS) whose hotkey is taken. */
  command: string;
  /** The other command with the same hotkey. */
  other: string;
  /** The hotkey, as shown to a person ("Alt+N", "Ctrl+["). */
  label: string;
}

const ARROWS: Record<string, string> = { arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓" };

/** A hotkey as a comparable string: "Mod" is Ctrl (Cmd on macOS and iOS), modifiers in a fixed order, key lower-cased. */
function comboKey(k: Hotkey, isMac: boolean): string {
  const mods = new Set<string>(k.modifiers.map(m => (m === "Mod" ? (isMac ? "Meta" : "Ctrl") : m)));
  return [...["Ctrl", "Meta", "Alt", "Shift"].filter(m => mods.has(m)), k.key.toLowerCase()].join("+");
}

/** A hotkey as a person reads it: "Ctrl+Alt+←", "Cmd+[" on macOS. */
export function hotkeyLabel(k: Hotkey, isMac: boolean): string {
  return comboKey(k, isMac)
    .split("+")
    .map((p, i, all) => {
      if (i < all.length - 1) return p === "Meta" ? (isMac ? "Cmd" : "Win") : isMac && p === "Alt" ? "Option" : p;
      return ARROWS[p] ?? (p.length === 1 ? p.toUpperCase() : p);
    })
    .join("+");
}

/**
 * Other commands whose effective hotkeys (their own, or their defaults when they have none) include a hotkey
 * Editor Defaults sets in HOTKEYS. `effective` maps every existing command id to its hotkeys. An enforced command
 * that doesn't exist (its plugin isn't installed or enabled) clashes with nothing: Obsidian skips a hotkey whose
 * command doesn't exist and runs the next one with that key.
 */
export function hotkeyClashes(effective: Record<string, readonly Hotkey[]>, isMac: boolean): HotkeyClash[] {
  const out: HotkeyClash[] = [];
  for (const [command, keys] of Object.entries(HOTKEYS)) {
    if (!(command in effective)) continue;
    for (const k of keys) {
      const want = comboKey(k, isMac);
      for (const [other, theirs] of Object.entries(effective)) {
        if (other in HOTKEYS) continue;
        if (theirs.some(t => comboKey(t, isMac) === want)) out.push({ command, other, label: hotkeyLabel(k, isMac) });
      }
    }
  }
  return out;
}

/** "a", "a and b", "a, b and c" */
export function list(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The "Enforce core plugins" setting's description, from the rules. */
export function corePluginsDescription(): string {
  const state = (on: boolean) => (on ? "on" : "off");
  const plain = ENFORCED.corePlugins.filter(r => !r.onlyWith).map(r => `${r.name} ${state(r.enabled)}`);
  const replaced = ENFORCED.corePlugins.flatMap(r =>
    r.onlyWith ? [`${r.name} ${state(r.enabled)} while ${r.onlyWith.name} is enabled`] : [],
  );
  return `Keeps ${list(plain)}${replaced.length ? `; ${list(replaced)}, which replace them` : ""}.`;
}

/** The "Enforce hotkeys" setting's description, from the rules ("Navigate back: Ctrl+Alt+← and Ctrl+[. …"). */
export function hotkeysDescription(isMac: boolean): string {
  return ENFORCED.hotkeys
    .map(h => `${h.name}: ${h.keys.length ? list(h.keys.map(k => hotkeyLabel(k, isMac))) : "no hotkey"}.`)
    .join(" ");
}

/** How Obsidian's settings name the values Editor Defaults sets (for its notices). */
const VALUE_NAMES: Record<string, Record<string, string>> = {
  newLinkFormat: {
    absolute: "Absolute path in vault",
    relative: "Relative path to file",
    shortest: "Shortest path when possible",
  },
  trashOption: { local: "Move to Obsidian trash", system: "Move to system trash", none: "Permanently delete" },
};

/** A vault config value (app.json) Editor Defaults keeps, and the setting that keeps it. */
export interface ConfigRule {
  key: string;
  setting: BoolKey;
  /** The value to keep; "" keeps nothing. */
  value(s: Settings): string;
  /** The value as a notice names it ('New link format: "Absolute path in vault"'). */
  what(value: string): string;
}

const named = (key: string, label: string) => (v: string) => `${label}: "${VALUE_NAMES[key]?.[v] ?? v}"`;

export const CONFIG_RULES: readonly ConfigRule[] = [
  {
    key: "newLinkFormat",
    setting: "forceRootPaths",
    value: () => ENFORCED.config.newLinkFormat,
    what: named("newLinkFormat", "New link format"),
  },
  {
    key: "attachmentFolderPath",
    setting: "forceAttachments",
    value: s => s.attachmentFolder.trim(),
    what: v => `Attachment folder: "${v}"`,
  },
  {
    key: "trashOption",
    setting: "forceTrash",
    value: () => ENFORCED.config.trashOption,
    what: named("trashOption", "Deleted files"),
  },
];
