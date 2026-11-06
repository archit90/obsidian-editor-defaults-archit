import { describe, expect, it } from "vitest";
import { isIsoText, isoDateTime, pickedText, pickerValue, shownDateTime } from "./properties";

describe("ISO date fields", () => {
  it("turns picked values into the stored ISO text", () => {
    expect(pickedText("date", "2026-11-06")).toBe("2026-11-06");
    expect(pickedText("datetime", "2026-11-06T09:30")).toBe("2026-11-06 09:30:00");
    expect(pickedText("datetime", "2026-11-06T09:30:15")).toBe("2026-11-06 09:30:15");
  });
  it("gives the picker the date in the field, or nothing", () => {
    expect(pickerValue("date", " 2026-11-06 ")).toBe("2026-11-06");
    expect(pickerValue("date", "11/06/2026")).toBe("");
    expect(pickerValue("datetime", "2026-11-06T09:30:15")).toBe("2026-11-06T09:30:15");
    expect(pickerValue("datetime", "2026-11-06 09:30")).toBe("2026-11-06T09:30:00");
    expect(pickerValue("datetime", "2026-11-06")).toBe("2026-11-06T00:00:00");
    expect(pickerValue("datetime", "")).toBe("");
  });
  it("shows date & times with a space and gives Obsidian ISO back", () => {
    expect(shownDateTime("2026-11-06T09:30:15")).toBe("2026-11-06 09:30:15");
    expect(shownDateTime("")).toBe("");
    expect(isoDateTime(" 2026-11-06 09:30:15 ")).toBe("2026-11-06T09:30:15");
    expect(isoDateTime("2026-11-06T09:30:15")).toBe("2026-11-06T09:30:15");
    expect(isoDateTime("2026-11-06")).toBe("2026-11-06");
  });
});

describe("strict ISO input (review ED-02)", () => {
  it("accepts complete ISO dates and clearing", () => {
    expect(isIsoText("date", "2026-11-06")).toBe(true);
    expect(isIsoText("date", "")).toBe(true);
    expect(isIsoText("datetime", "2026-11-06 09:30:15")).toBe(true);
    expect(isIsoText("datetime", "2026-11-06 09:30")).toBe(true);
    expect(isIsoText("datetime", "2026-11-06T09:30:15")).toBe(true);
  });
  it("refuses what Obsidian's lenient parse would misread", () => {
    for (const t of ["06/11/2026", "11/06/2026", "6.11.2026", "2026", "2026-1", "2026-02-30"])
      expect(isIsoText("date", t)).toBe(false);
    expect(isIsoText("datetime", "06/11/2026 10:00")).toBe(false);
  });
});
