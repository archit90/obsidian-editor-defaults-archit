import { describe, expect, it, vi } from "vitest";
import { DriftGuard } from "./drift";

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
  it("says when a refused item may be put back again, so it's checked then without another change", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = new DriftGuard(3, 1000);
    expect(g.retryAt("a", 0)).toBeNull();
    for (const t of [0, 10, 20]) g.record("a", t);
    expect(g.allow("a", 30)).toBe(false);
    expect(g.retryAt("a", 30)).toBe(1000); // when the put-back at 0 leaves the window
    expect(g.allow("a", 1000)).toBe(true);
    warn.mockRestore();
  });
  it("counts each item on its own, so changing several settings by hand is always undone", () => {
    const g = new DriftGuard(2, 1000);
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect(g.allow(id, 0)).toBe(true);
      g.record(id, 0);
    }
  });
  it("stops an item for the session after too many put-backs in the long window (a slow fight through sync)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = new DriftGuard(5, 1000, 4, 100_000);
    // one put-back every 2 s never trips the short window
    for (const t of [0, 2000, 4000, 6000]) {
      expect(g.allow("a", t)).toBe(true);
      g.record("a", t);
    }
    expect(g.allow("a", 8000)).toBe(false);
    expect(g.takeStopped()).toEqual(["a"]);
    expect(g.takeStopped()).toEqual([]); // reported once
    expect(g.allow("a", 500_000)).toBe(false); // for the rest of the session
    expect(g.retryAt("a", 500_000)).toBeNull();
    expect(g.allow("b", 8000)).toBe(true);
    warn.mockRestore();
  });
});
