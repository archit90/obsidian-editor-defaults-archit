// Hotkey labels and clash checks for the hotkeys the settings note sets, and a small list helper for notices.
import type { Hotkey } from "obsidian";

/** A hotkey of another command that is the same key as one the settings note sets. */
export interface HotkeyClash {
  /** The command the note sets the hotkey for. */
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
 * the settings note sets (`wanted`). `effective` maps every existing command id to its hotkeys. An enforced command
 * that doesn't exist (its plugin isn't installed or enabled) clashes with nothing: Obsidian skips a hotkey whose
 * command doesn't exist and runs the next one with that key.
 */
export function hotkeyClashes(
  wanted: Readonly<Record<string, readonly Hotkey[]>>,
  effective: Record<string, readonly Hotkey[]>,
  isMac: boolean,
): HotkeyClash[] {
  const out: HotkeyClash[] = [];
  for (const [command, keys] of Object.entries(wanted)) {
    if (!(command in effective)) continue;
    for (const k of keys) {
      const want = comboKey(k, isMac);
      for (const [other, theirs] of Object.entries(effective)) {
        if (other in wanted) continue;
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
