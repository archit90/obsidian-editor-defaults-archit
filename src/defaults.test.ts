import { describe, expect, it } from "vitest";
import { CORE_PLUGINS, HOTKEYS, sameHotkeys } from "./defaults";

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
