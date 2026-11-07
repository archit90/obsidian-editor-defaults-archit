import type { Hotkey } from "obsidian";

/** Core plugin id -> wanted state. */
export const CORE_PLUGINS: Record<string, boolean> = {
  bases: true,
  templates: false, // Templater replaces it
  "zk-prefixer": false, // "Unique note creator"
  backlink: false, // Backlinks Full View's "All backlinks" pane replaces it
};

/** Command id -> the hotkeys it should have (replaces Obsidian's defaults for it, so those are listed too). */
export const HOTKEYS: Record<string, Hotkey[]> = {
  "app:go-back": [
    { modifiers: ["Mod", "Alt"], key: "ArrowLeft" }, // Obsidian's default
    { modifiers: ["Mod"], key: "[" },
  ],
  "app:go-forward": [
    { modifiers: ["Mod", "Alt"], key: "ArrowRight" }, // Obsidian's default
    { modifiers: ["Mod"], key: "]" },
  ],
  // Templater: Alt+N creates a new note from a template; "Open insert template modal" (which inserts into the
  // open note) gets no hotkey, so an Alt+N saved on it earlier goes
  "templater-obsidian:create-new-note-from-template": [{ modifiers: ["Alt"], key: "N" }],
  "templater-obsidian:insert-templater": [],
};

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

/** A hotkey as a comparable string: "Mod" is Ctrl (Cmd on macOS), modifiers in a fixed order, key lower-cased. */
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
 * Editor Defaults sets in HOTKEYS. `effective` maps every existing command id to its hotkeys.
 */
export function hotkeyClashes(effective: Record<string, readonly Hotkey[]>, isMac: boolean): HotkeyClash[] {
  const out: HotkeyClash[] = [];
  for (const [command, keys] of Object.entries(HOTKEYS))
    for (const k of keys) {
      const want = comboKey(k, isMac);
      for (const [other, theirs] of Object.entries(effective)) {
        if (other in HOTKEYS) continue;
        if (theirs.some(t => comboKey(t, isMac) === want)) out.push({ command, other, label: hotkeyLabel(k, isMac) });
      }
    }
  return out;
}
