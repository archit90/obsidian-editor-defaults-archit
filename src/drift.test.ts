import { describe, expect, it, vi } from "vitest";
import { DriftGuard, ENFORCED_CONFIG, revertNotice } from "./drift";

describe("DriftGuard", () => {
  it("allows a few reverts of one item, then stops while they keep coming, then allows again", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = new DriftGuard(3, 1000);
    for (const t of [0, 10, 20]) {
      expect(g.allow("a", t)).toBe(true);
      g.record("a", t);
    }
    expect(g.allow("a", 30)).toBe(false);
    expect(g.allow("a", 40)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(g.allow("a", 1015)).toBe(true); // the first two are out of the window
    warn.mockRestore();
  });
  it("counts each item on its own, so changing several settings by hand is always undone", () => {
    const g = new DriftGuard(2, 1000);
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(g.allow(id, 0)).toBe(true);
      g.record(id, 0);
    }
  });
});

describe("enforced config keys", () => {
  it("are the three Files and links settings", () => {
    expect([...ENFORCED_CONFIG].sort()).toEqual(["attachmentFolderPath", "newLinkFormat", "trashOption"]);
  });
});

describe("revertNotice", () => {
  it("names what was put back and each setting once", () => {
    expect(revertNotice(["A"], ["S"])).toBe(
      'Editor Defaults put back A.\nTo change this, first turn off "S" in Editor Defaults\' settings.',
    );
    expect(revertNotice(["A", "B", "C"], ["S", "T", "S"])).toBe(
      'Editor Defaults put back A, B and C.\nTo change these, first turn off "S" and "T" in Editor Defaults\' settings.',
    );
  });
});
