import { describe, expect, it } from "vitest";
import { isoDateTime, pickedText, pickerValue, shownDateTime } from "./properties";

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
