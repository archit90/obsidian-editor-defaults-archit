import { describe, expect, it } from "vitest";
import { parseYaml } from "obsidian";
import { capture, differences, equal, merged, toJson, withoutDefaults } from "./json";
import { formatHotkey, normalHotkeys, parseHotkey } from "./hotkeys";
import { addLinesAfter, appendSection, findBlocks, replaceBlockYaml } from "./note";
import { appliesHere, blockValue, readNote, wantedCorePlugins } from "./model";
import { bundledNote } from "./setup";

describe("json", () => {
  it("merges objects key by key; lists and values replace", () => {
    expect(merged({ a: 1, b: { c: 1, d: 2 }, l: [1, 2] }, { b: { c: 5 }, l: [3], n: "x" })).toEqual({
      a: 1,
      b: { c: 5, d: 2 },
      l: [3],
      n: "x",
    });
  });
  it("finds differing paths", () => {
    expect(differences({ a: 1, b: { c: 1 }, l: [1] }, { a: 1, b: { c: 2, x: 1 }, l: [1, 2] })).toEqual(["b.c", "l"]);
    expect(differences({ a: 1 }, undefined)).toEqual(["a"]);
    expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
  });
  it("captures changed keys, keeps managed sub-objects narrow, drops what is back to default", () => {
    const r = capture(
      { a: 1, nested: { x: 1 }, gone: 5 },
      { a: 1, nested: { x: 1, y: 1 }, b: 0, gone: 5, noise: 1 },
      { a: 2, nested: { x: 3, y: 9 }, b: 7, gone: 0, noise: 2 },
      { ignore: ["noise"], defaults: { gone: 0, b: 0 } },
    );
    expect(r.values).toEqual({ a: 2, nested: { x: 3, y: 9 }, b: 7 });
    expect(r.changed).toEqual(["a", "nested.x"]);
    expect(r.added).toEqual(["nested.y", "b"]);
    expect(r.removed).toEqual(["gone"]);
  });
  it("a key removed from the file leaves the note", () => {
    const r = capture({ a: 1, b: 2 }, { a: 1, b: 2 }, { b: 2 });
    expect(r.values).toEqual({ b: 2 });
    expect(r.removed).toEqual(["a"]);
  });
  it("a new key equal to its default isn't added", () => {
    expect(capture({}, {}, { a: 0 }, { defaults: { a: 0 } }).values).toEqual({});
  });
  it("withoutDefaults keeps only what differs", () => {
    expect(withoutDefaults({ a: 1, b: 2, o: { x: 1, y: 2 } }, { a: 1, o: { x: 1 } })).toEqual({ b: 2, o: { y: 2 } });
    expect(withoutDefaults({ a: 1, b: 2 }, p => (p === "b" ? 2 : undefined))).toEqual({ a: 1 });
  });
});

describe("hotkeys", () => {
  it("parses and formats", () => {
    expect(parseHotkey("Alt+Mod+ArrowLeft")).toEqual({ modifiers: ["Mod", "Alt"], key: "ArrowLeft" });
    expect(parseHotkey("Mod+[")).toEqual({ modifiers: ["Mod"], key: "[" });
    expect(parseHotkey("Mod++")).toEqual({ modifiers: ["Mod"], key: "+" });
    expect(parseHotkey("Hyper+N")).toBeNull();
    expect(parseHotkey("Mod+")).toBeNull();
    expect(formatHotkey({ modifiers: ["Alt"], key: "n" })).toBe("Alt+N");
    expect(normalHotkeys(["alt+n"])).toBeNull();
    expect(normalHotkeys(["Alt+n", "Shift+Mod+K"])).toEqual(["Alt+N", "Mod+Shift+K"]);
  });
});

const NOTE = `---
type: system
---

# Vault settings

Why.

## Templater

Templates in _t.

\`\`\`vault-settings
plugin: templater-obsidian
settings:
  templates_folder: _t
\`\`\`

## Other

\`\`\`js
not: a block
\`\`\`

\`\`\`vault-settings
obsidian: app
settings:
  newLinkFormat: absolute
\`\`\`
`;

describe("note", () => {
  it("finds blocks with their headings, skipping other fences", () => {
    const b = findBlocks(NOTE);
    expect(b.map(x => [x.heading, x.line])).toEqual([
      ["Templater", 13],
      ["Other", 25],
    ]);
    expect(b[0].yaml).toBe("plugin: templater-obsidian\nsettings:\n  templates_folder: _t\n");
  });
  it("replaces one block's YAML and keeps the prose", () => {
    const b = findBlocks(NOTE)[1];
    const out = replaceBlockYaml(NOTE, b, "obsidian: app\nsettings:\n  newLinkFormat: relative");
    expect(out).toContain("newLinkFormat: relative\n```\n");
    expect(out.replace("relative", "absolute")).toBe(NOTE);
  });
  it("adds dated lines after a block, in order", () => {
    let t = addLinesAfter(NOTE, findBlocks(NOTE)[0], ["`a` added"]);
    t = addLinesAfter(t, findBlocks(t)[0], ["`b` added"]);
    expect(t).toContain("templates_folder: _t\n```\n\n- `a` added\n- `b` added\n\n## Other");
    const last = addLinesAfter(NOTE, findBlocks(NOTE)[1], ["`c`"]);
    expect(last.endsWith("```\n\n- `c`\n")).toBe(true);
  });
  it("appends a section", () => {
    const t = appendSection("# X\n", "Dataview", "Added from Settings.", "plugin: dataview\n");
    expect(t).toBe("# X\n\n## Dataview\n\nAdded from Settings.\n\n```vault-settings\nplugin: dataview\n```\n");
    expect(findBlocks(t)[0].heading).toBe("Dataview");
  });
});

describe("model", () => {
  it("reads blocks and reports errors without stopping", () => {
    const text =
      NOTE +
      "\n```vault-settings\nplugin: x\nstate: gone\n```\n" +
      "\n```vault-settings\nobsidian: app\n```\n" +
      "\n```vault-settings\nobsidian: hotkeys\nsettings:\n  app:go-back: [Hyper+X]\n```\n" +
      "\n```vault-settings\n: bad: yaml\n```\n" +
      "\n```vault-settings\nobsidian: canvas\nonly: mobile\nsettings: { newFileFolderPath: c }\n```\n" +
      "\n```vault-settings\nplugin: brat-x\nsource: github:o/r\nversion: '1.0.1'\n```\n";
    const n = readNote(text, parseYaml);
    expect(n.blocks.map(b => (b.kind === "plugin" ? b.id : b.target))).toEqual([
      "templater-obsidian",
      "app",
      "config:canvas",
      "brat-x",
    ]);
    expect(n.errors.map(e => e.message)).toEqual([
      "state: enabled, disabled or uninstalled",
      "app is set by an earlier block already",
      'hotkeys of "app:go-back": a list like [Mod+Alt+ArrowLeft, "Mod+["] ([] for none)',
      expect.stringMatching(/^YAML: /),
    ]);
    const canvas = n.blocks[2];
    expect(appliesHere(canvas, false)).toBe(false);
    expect(appliesHere(canvas, true)).toBe(true);
    const brat = n.blocks[3];
    expect(brat.kind === "plugin" && brat.source).toEqual({ type: "github", repo: "o/r" });
    expect(blockValue(brat, { a: 1 })).toEqual({
      plugin: "brat-x",
      source: "github:o/r",
      version: "1.0.1",
      settings: { a: 1 },
    });
  });
  it("core plugins with onlyWith count only while that plugin is loaded", () => {
    const s = { bases: true, templates: { enabled: false, onlyWith: "templater-obsidian" } };
    expect(wantedCorePlugins(s, () => false)).toEqual({ bases: true });
    expect(wantedCorePlugins(s, () => true)).toEqual({ bases: true, templates: false });
  });
});

describe("toJson", () => {
  it("leaves out what isn't JSON and parts that refer back to themselves", () => {
    const o: Record<string, unknown> = { a: 1, f: () => 1, m: new Map(), d: { x: [1, "y"] } };
    o.self = o;
    expect(toJson(o)).toEqual({ a: 1, d: { x: [1, "y"] } });
    const shared = { k: 1 };
    expect(toJson({ p: shared, q: shared })).toEqual({ p: { k: 1 }, q: { k: 1 } });
  });
});

describe("the bundled settings note", () => {
  it("parses without errors, dated as asked, with a block per plugin and Obsidian's settings", () => {
    const text = bundledNote("2030-01-02T03:04:05");
    expect(text).toMatch(/^---\ntype: system\ncreated: 2030-01-02T03:04:05\n---\n/);
    const n = readNote(text, parseYaml);
    expect(n.errors).toEqual([]);
    const plugins = n.blocks.flatMap(b => (b.kind === "plugin" ? [b.id] : []));
    expect(plugins).toContain("editor-defaults-archit");
    expect(plugins).toContain("templater-obsidian");
    expect(plugins).toContain("obsidian42-brat");
    expect(n.blocks.filter(b => b.kind === "obsidian").map(b => (b.kind === "obsidian" ? b.target : ""))).toEqual([
      "app",
      "core-plugins",
      "hotkeys",
      "property-types",
      "config:canvas",
    ]);
  });
});
