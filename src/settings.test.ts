import { describe, expect, it } from "vitest";
import { DEFAULTS, parseSettings, SETTING_NAMES } from "./settings";

describe("parseSettings (data.json)", () => {
  it("gives the defaults for nothing saved or something that isn't an object", () => {
    for (const raw of [null, undefined, "x", 3, []]) expect(parseSettings(raw)).toEqual(DEFAULTS);
  });
  it("takes the saved values over the defaults (an older data.json with fewer keys)", () => {
    expect(parseSettings({ forceTrash: false })).toEqual({ ...DEFAULTS, forceTrash: false });
    expect(parseSettings({ attachmentFolder: "assets", isoDates: false })).toEqual({
      ...DEFAULTS,
      attachmentFolder: "assets",
      isoDates: false,
    });
  });
  it("ignores unknown keys and values of the wrong type", () => {
    expect(parseSettings({ forceTrash: "no", attachmentFolder: 5, other: true })).toEqual(DEFAULTS);
  });
});

describe("setting names", () => {
  it("name every setting", () => {
    expect(Object.keys(SETTING_NAMES).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });
});
