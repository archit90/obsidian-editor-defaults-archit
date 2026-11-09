import { describe, expect, it } from "vitest";
import { DEFAULTS, parseSettings, SETTING_NAMES } from "./settings";

describe("parseSettings (data.json)", () => {
  it("gives the defaults for nothing saved or something that isn't an object", () => {
    for (const raw of [null, undefined, "x", 3, []]) expect(parseSettings(raw)).toEqual(DEFAULTS);
  });
  it("takes the saved values over the defaults (an older data.json with fewer keys)", () => {
    expect(parseSettings({ stripAlias: false })).toEqual({ ...DEFAULTS, stripAlias: false });
    expect(parseSettings({ setupNote: "x/Setup.md", isoDates: false })).toEqual({
      ...DEFAULTS,
      setupNote: "x/Setup.md",
      isoDates: false,
    });
  });
  it("ignores unknown keys and values of the wrong type", () => {
    expect(parseSettings({ stripAlias: "no", setupNote: 5, other: true })).toEqual(DEFAULTS);
    // an older version's settings (the enforce toggles) are ignored
    expect(parseSettings({ forceTrash: false, attachmentFolder: "u" })).toEqual(DEFAULTS);
    // an earlier build's default (in _s/) moves to the vault root
    expect(DEFAULTS.setupNote).toBe("Vault settings.md");
    expect(parseSettings({ setupNote: "_s/Vault settings.md" }).setupNote).toBe("Vault settings.md");
    // a note path must be a markdown file
    expect(parseSettings({ setupNote: "x/Setup" }).setupNote).toBe(DEFAULTS.setupNote);
  });
});

describe("setting names", () => {
  it("name every setting", () => {
    expect(Object.keys(SETTING_NAMES).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
});
