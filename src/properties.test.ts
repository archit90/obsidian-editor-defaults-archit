import { describe, expect, it } from "vitest";
import {
  canonicalText,
  invalidDateNotice,
  isDateWidget,
  isIsoText,
  isoDateTime,
  pickedText,
  pickerValue,
  shownDateTime,
} from "./properties";

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

describe("strict ISO input: Obsidian's lenient parse would misread other text", () => {
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

describe("what a saved field shows", () => {
  it("date & times with a space and seconds, whatever form was typed", () => {
    expect(canonicalText("datetime", "2026-11-07 10:00")).toBe("2026-11-07 10:00:00");
    expect(canonicalText("datetime", "2026-11-07T11:00:00")).toBe("2026-11-07 11:00:00");
    expect(canonicalText("datetime", " 2026-11-07 10:00:15 ")).toBe("2026-11-07 10:00:15");
    expect(canonicalText("datetime", "2026-11-07")).toBe("2026-11-07 00:00:00");
  });
  it("dates trimmed; invalid and empty text unchanged", () => {
    expect(canonicalText("date", " 2026-11-07 ")).toBe("2026-11-07");
    expect(canonicalText("date", "06/11/2026")).toBe("06/11/2026");
    expect(canonicalText("datetime", "7 Nov 2026")).toBe("7 Nov 2026");
    expect(canonicalText("datetime", "")).toBe("");
  });
});

describe("the notice for text that isn't a date", () => {
  it("says what was typed, the format, and what the field went back to", () => {
    expect(invalidDateNotice("date", " 06/11/2026 ", "2026-11-06")).toBe(
      '"06/11/2026" isn\'t a valid date (use YYYY-MM-DD), so it wasn\'t saved. The field is back to "2026-11-06".',
    );
    expect(invalidDateNotice("datetime", "7 Nov", "2026-11-07T10:00")).toBe(
      '"7 Nov" isn\'t a valid date & time (use YYYY-MM-DD HH:mm:ss), so it wasn\'t saved. The field is back to "2026-11-07 10:00:00".',
    );
    expect(invalidDateNotice("date", "x", "")).toMatch(/back to empty\.$/);
  });
});

describe("isDateWidget", () => {
  it("knows Obsidian's widget by its input element, from any window", () => {
    expect(isDateWidget({ inputEl: { tagName: "INPUT" } })).toBe(true);
    expect(isDateWidget({ inputEl: { tagName: "DIV" } })).toBe(false);
    for (const w of [undefined, null, {}, "x"]) expect(isDateWidget(w)).toBe(false);
  });
});
