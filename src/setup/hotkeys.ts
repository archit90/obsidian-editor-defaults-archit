// Hotkeys as the settings note writes them ("Mod+Alt+ArrowLeft", "Mod+[", "Alt+N") and as Obsidian stores them
// ({ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }). Pure.
import type { Hotkey, Modifier } from "obsidian";

/** Modifiers in the order the note writes them. */
const ORDER: readonly Modifier[] = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
const isModifier = (m: string): m is Modifier => (ORDER as readonly string[]).includes(m);

/** "Mod+Alt+ArrowLeft" as a Hotkey; null if it isn't one (an unknown modifier, no key). "Mod++" is Mod and "+". */
export function parseHotkey(text: string): Hotkey | null {
  const s = text.trim();
  if (!s) return null;
  const parts = s.endsWith("++") ? [...s.slice(0, -2).split("+"), "+"] : s.split("+");
  const key = parts.pop() ?? "";
  if (!key) return null;
  const modifiers: Modifier[] = [];
  for (const p of parts) {
    if (!isModifier(p) || modifiers.includes(p)) return null;
    modifiers.push(p);
  }
  return { modifiers: ORDER.filter(m => modifiers.includes(m)), key };
}

/** A Hotkey as the note writes it: modifiers in a fixed order, then the key (a single letter upper-cased). */
export function formatHotkey(h: Hotkey): string {
  const key = h.key.length === 1 ? h.key.toUpperCase() : h.key;
  return [...ORDER.filter(m => h.modifiers.includes(m)), key].join("+");
}

/** A list of hotkey strings in the note's form, so two lists compare equal when they mean the same keys. */
export function normalHotkeys(list: readonly string[]): string[] | null {
  const out: string[] = [];
  for (const t of list) {
    const h = parseHotkey(t);
    if (!h) return null;
    out.push(formatHotkey(h));
  }
  return out;
}
