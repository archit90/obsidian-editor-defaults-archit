import { describe, expect, it } from "vitest";
import type { Hotkey } from "obsidian";
import { hotkeyClashes, hotkeyLabel, list } from "./defaults";

describe("hotkey clashes", () => {
  const HOTKEYS: Record<string, Hotkey[]> = {
    "app:go-back": [
      { modifiers: ["Mod", "Alt"], key: "ArrowLeft" },
      { modifiers: ["Mod"], key: "[" },
    ],
    "templater-obsidian:create-new-note-from-template": [{ modifiers: ["Alt"], key: "N" }],
  };
  const templater = {
    "templater-obsidian:create-new-note-from-template": HOTKEYS["templater-obsidian:create-new-note-from-template"],
  };
  it("finds another command with an enforced hotkey, own or default, Mod written as Ctrl", () => {
    const clashes = hotkeyClashes(
      HOTKEYS,
      {
        "editor:toggle-bold": [{ modifiers: ["Alt"], key: "n" }],
        "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }],
        "x:fine": [{ modifiers: ["Alt", "Shift"], key: "N" }],
        "app:go-back": HOTKEYS["app:go-back"],
        ...templater,
      },
      false,
    );
    expect(clashes).toEqual([
      { command: "app:go-back", other: "x:outdent", label: "Ctrl+[" },
      { command: "templater-obsidian:create-new-note-from-template", other: "editor:toggle-bold", label: "Alt+N" },
    ]);
  });
  it("an enforced command that doesn't exist (Templater not installed) clashes with nothing", () => {
    expect(hotkeyClashes(HOTKEYS, { "editor:toggle-bold": [{ modifiers: ["Alt"], key: "N" }] }, false)).toEqual([]);
  });
  it("on macOS Mod is Cmd, so Ctrl+[ doesn't clash with Mod+[", () => {
    const back = { "app:go-back": HOTKEYS["app:go-back"] };
    expect(hotkeyClashes(HOTKEYS, { ...back, "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }] }, true)).toEqual([]);
    expect(
      hotkeyClashes(HOTKEYS, { ...back, "x:a": [{ modifiers: ["Meta", "Alt"], key: "ArrowLeft" }] }, true),
    ).toEqual([{ command: "app:go-back", other: "x:a", label: "Cmd+Option+←" }]);
  });
  it("labels arrows and modifiers in a fixed order", () => {
    expect(hotkeyLabel({ modifiers: ["Alt", "Mod"], key: "ArrowRight" }, false)).toBe("Ctrl+Alt+→");
  });
});

describe("list", () => {
  it("joins with commas and a final and", () => {
    expect([list([]), list(["a"]), list(["a", "b"]), list(["a", "b", "c"])]).toEqual([
      "",
      "a",
      "a and b",
      "a, b and c",
    ]);
  });
});
