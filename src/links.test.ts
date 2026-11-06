import { describe, expect, it } from "vitest";
import { trailingAliasFix } from "./links";

describe("trailingAliasFix", () => {
  it("drops the alias of a link that ends at the cursor", () => {
    expect(trailingAliasFix("see [[x/notes/Plan|Plan]]")).toEqual({ from: 4, text: "[[x/notes/Plan]]" });
  });
  it("keeps headings and blocks in the target", () => {
    expect(trailingAliasFix("[[a/b#Goals|b > Goals]]")).toEqual({ from: 0, text: "[[a/b#Goals]]" });
  });
  it("handles an empty alias", () => {
    expect(trailingAliasFix("[[a|]]")).toEqual({ from: 0, text: "[[a]]" });
  });
  it("leaves links without an alias, or not at the cursor, alone", () => {
    expect(trailingAliasFix("[[a]]")).toBeNull();
    expect(trailingAliasFix("[[a|b]] and more")).toBeNull();
    expect(trailingAliasFix("plain text")).toBeNull();
  });
  it("only touches the last link on the line", () => {
    expect(trailingAliasFix("[[a|A]] [[b|B]]")).toEqual({ from: 8, text: "[[b]]" });
  });
});
