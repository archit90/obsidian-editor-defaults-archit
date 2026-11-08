import { describe, expect, it } from "vitest";
import { fixPickedLink, isLinkTrigger, linkAt } from "./links";

/** Applies fixPickedLink to `line` with the cursor at `¦`, and returns the result with `¦` at the new cursor. */
function pick(marked: string, fix: Parameters<typeof fixPickedLink>[2]): string | null {
  const ch = marked.indexOf("¦");
  const line = marked.slice(0, ch) + marked.slice(ch + 1);
  const r = fixPickedLink(line, ch, fix);
  if (!r) return null;
  const out = line.slice(0, r.from) + r.text + line.slice(r.to);
  return out.slice(0, r.ch) + "¦" + out.slice(r.ch);
}

describe("linkAt", () => {
  it("finds the link around the cursor, split into path, subpath and alias", () => {
    expect(linkAt("see [[z/A#Goals|A]] x", 19)).toEqual({
      from: 4,
      to: 19,
      path: "z/A",
      subpath: "#Goals",
      alias: "A",
    });
    expect(linkAt("see [[z/A]] x", 7)).toMatchObject({ path: "z/A", subpath: "", alias: undefined });
  });
  it("ignores links the cursor isn't in", () => {
    expect(linkAt("[[a]] b", 6)).toBeNull();
    expect(linkAt("[[a]] b", 0)).toBeNull();
    expect(linkAt("plain", 2)).toBeNull();
  });
  it("picks the right one of several links", () => {
    expect(linkAt("[[a|A]] [[b|B]]", 15)?.path).toBe("b");
    expect(linkAt("[[a|A]] [[b|B]]", 7)?.path).toBe("a");
  });
});

describe("fixPickedLink: only the alias Obsidian adds goes", () => {
  it("Enter / click: cursor after ]]", () => {
    expect(pick("see [[z/Bar|Bar]]¦ x", { dropAlias: "Bar" })).toBe("see [[z/Bar]]¦ x");
  });
  it("Tab: cursor before ]]", () => {
    expect(pick("see [[z/Bar|Bar¦]] x", { dropAlias: "Bar" })).toBe("see [[z/Bar¦]] x");
  });
  it("typing # or ^ with a note selected: cursor after the # it added", () => {
    expect(pick("see [[z/Bar#¦|Bar]]", { dropAlias: "Bar" })).toBe("see [[z/Bar#¦]]");
    expect(pick("see [[z/Bar#^¦|Bar]]", { dropAlias: "Bar" })).toBe("see [[z/Bar#^¦]]");
  });
  it("keeps an alias the user wrote, or one picked from the note's aliases", () => {
    expect(pick("see [[z/Bar|my words]]¦", { dropAlias: "Bar" })).toBeNull();
  });
  it("keeps headings and blocks in the target", () => {
    expect(pick("[[a/b#Goals|b]]¦", { dropAlias: "b" })).toBe("[[a/b#Goals]]¦");
  });
  it("relative paths", () => {
    expect(pick("[[../z/Bar|Bar]]¦", { dropAlias: "Bar" })).toBe("[[../z/Bar]]¦");
  });
  it("only touches the link at the cursor", () => {
    expect(pick("[[a|a]] [[b|b]]¦", { dropAlias: "b" })).toBe("[[a|a]] [[b]]¦");
    expect(pick("[[a|a]]¦ [[b|b]]", { dropAlias: "a" })).toBe("[[a]]¦ [[b|b]]");
  });
  it("does nothing without a link at the cursor", () => {
    expect(pick("plain¦ text", { dropAlias: "x" })).toBeNull();
  });
});

describe("fixPickedLink: heading and block picks get the path from the vault root", () => {
  it("replaces the note name as typed with the full path", () => {
    expect(pick("see [[Bar#Goals]]¦", { path: "z/Bar" })).toBe("see [[z/Bar#Goals]]¦");
    expect(pick("see [[Bar#^abc123]]¦", { path: "z/Bar" })).toBe("see [[z/Bar#^abc123]]¦");
  });
  it("keeps an alias and the cursor's place", () => {
    expect(pick("[[Bar#Goals|my words]]¦", { path: "z/Bar" })).toBe("[[z/Bar#Goals|my words]]¦");
    expect(pick("[[Bar#Goals¦]]", { path: "z/Bar" })).toBe("[[z/Bar#Goals¦]]");
  });
  it("does nothing when the path is already right", () => {
    expect(pick("[[z/Bar#Goals]]¦", { path: "z/Bar" })).toBeNull();
  });
});

describe("isLinkTrigger: only picks from a [[ or ![[ dropdown are changed", () => {
  it("is true right after [[ or ![[", () => {
    expect(isLinkTrigger("see [[")).toBe(true);
    expect(isLinkTrigger("![[")).toBe(true);
  });
  it("is false for other suggesters' triggers", () => {
    for (const before of ["", "#", "/", "[", "see @@", "[[x]] "]) expect(isLinkTrigger(before)).toBe(false);
  });
});
