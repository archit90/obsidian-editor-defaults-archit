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
};

/** Whether two hotkey lists are the same, ignoring modifier order and key case. */
export function sameHotkeys(a: readonly Hotkey[] | undefined, b: readonly Hotkey[] | undefined): boolean {
  const norm = (ks: readonly Hotkey[] | undefined) =>
    JSON.stringify((ks ?? []).map(k => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
  return norm(a) === norm(b);
}
