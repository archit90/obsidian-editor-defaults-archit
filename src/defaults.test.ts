import { describe, expect, it } from "vitest";
import { CORE_PLUGINS, HOTKEYS, hotkeyClashes, hotkeyLabel, sameHotkeys } from "./defaults";

describe("sameHotkeys", () => {
  it("ignores modifier order and key case", () => {
    expect(
      sameHotkeys([{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }], [{ modifiers: ["Alt", "Mod"], key: "arrowleft" }]),
    ).toBe(true);
  });
  it("treats missing as empty and compares order of hotkeys", () => {
    expect(sameHotkeys(undefined, [])).toBe(true);
    expect(sameHotkeys(undefined, HOTKEYS["app:go-back"])).toBe(false);
    const [a, b] = HOTKEYS["app:go-back"];
    expect(sameHotkeys([a, b], [b, a])).toBe(false);
  });
});

describe("defaults", () => {
  it("turns core Backlinks off (Backlinks Full View replaces it) and Bases on", () => {
    expect(CORE_PLUGINS.backlink).toBe(false);
    expect(CORE_PLUGINS.bases).toBe(true);
  });
  it("keeps Obsidian's own back / forward hotkeys next to the added ones", () => {
    expect(HOTKEYS["app:go-back"]).toContainEqual({ modifiers: ["Mod", "Alt"], key: "ArrowLeft" });
    expect(HOTKEYS["app:go-forward"]).toContainEqual({ modifiers: ["Mod", "Alt"], key: "ArrowRight" });
  });
});

describe("Templater hotkeys (tweak 53)", () => {
  it("Alt+N creates a new note from a template; the insert modal has none", () => {
    expect(HOTKEYS["templater-obsidian:create-new-note-from-template"]).toEqual([{ modifiers: ["Alt"], key: "N" }]);
    expect(HOTKEYS["templater-obsidian:insert-templater"]).toEqual([]);
    // an Alt+N saved on the insert modal earlier differs, so it gets cleared
    expect(sameHotkeys([{ modifiers: ["Alt"], key: "N" }], HOTKEYS["templater-obsidian:insert-templater"])).toBe(false);
  });
});

describe("hotkey clashes (user decision 3)", () => {
  it("finds another command with an enforced hotkey, own or default, Mod written as Ctrl", () => {
    const clashes = hotkeyClashes(
      {
        "editor:toggle-bold": [{ modifiers: ["Alt"], key: "n" }],
        "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }],
        "x:fine": [{ modifiers: ["Alt", "Shift"], key: "N" }],
        "app:go-back": HOTKEYS["app:go-back"],
      },
      false,
    );
    expect(clashes).toEqual([
      { command: "app:go-back", other: "x:outdent", label: "Ctrl+[" },
      { command: "templater-obsidian:create-new-note-from-template", other: "editor:toggle-bold", label: "Alt+N" },
    ]);
  });
  it("on macOS Mod is Cmd, so Ctrl+[ doesn't clash with Mod+[", () => {
    expect(hotkeyClashes({ "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }] }, true)).toEqual([]);
    expect(hotkeyClashes({ "x:a": [{ modifiers: ["Meta", "Alt"], key: "ArrowLeft" }] }, true)).toEqual([
      { command: "app:go-back", other: "x:a", label: "Cmd+Option+←" },
    ]);
  });
  it("labels arrows and modifiers in a fixed order", () => {
    expect(hotkeyLabel({ modifiers: ["Alt", "Mod"], key: "ArrowRight" }, false)).toBe("Ctrl+Alt+→");
  });
});
