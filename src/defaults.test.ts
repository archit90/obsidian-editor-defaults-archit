import { describe, expect, it } from "vitest";
import {
  CONFIG_RULES,
  corePluginsDescription,
  ENFORCED,
  HOTKEY_NAMES,
  HOTKEYS,
  hotkeyClashes,
  hotkeyLabel,
  hotkeysDescription,
  parseDefaults,
  sameHotkeys,
  wantedCorePlugins,
} from "./defaults";
import { DEFAULTS } from "./settings";

describe("defaults.json", () => {
  it("parses into the enforced defaults", () => {
    expect(ENFORCED.attachmentFolder).toBe("u");
    expect(ENFORCED.config).toEqual({ newLinkFormat: "absolute", trashOption: "local" });
    expect(ENFORCED.corePlugins.map(r => r.id)).toEqual(["bases", "templates", "zk-prefixer", "backlink"]);
    expect(Object.keys(HOTKEYS)).toEqual([
      "app:go-back",
      "app:go-forward",
      "templater-obsidian:create-new-note-from-template",
      "templater-obsidian:insert-templater",
    ]);
  });
  it("refuses a malformed file instead of half-applying it", () => {
    const good: unknown = JSON.parse(JSON.stringify(ENFORCED));
    expect(parseDefaults(good)).toEqual(ENFORCED);
    const bad = (f: (d: { hotkeys: { keys: { modifiers: string[] }[] }[]; corePlugins: object[] }) => void) => {
      const d = JSON.parse(JSON.stringify(ENFORCED));
      f(d);
      return () => parseDefaults(d);
    };
    expect(bad(d => (d.hotkeys[0].keys[0].modifiers = ["Command"]))).toThrow(/modifiers/);
    expect(bad(d => (d.corePlugins[0] = { id: "bases", name: "Bases", enabled: "yes" }))).toThrow(/corePlugins\[0\]/);
    expect(() => parseDefaults(null)).toThrow(/config/);
  });
  it("is where the plugin's own defaults come from", () => {
    expect(DEFAULTS.attachmentFolder).toBe(ENFORCED.attachmentFolder);
  });
});

describe("sameHotkeys", () => {
  it("ignores modifier order and key case", () => {
    expect(
      sameHotkeys([{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }], [{ modifiers: ["Alt", "Mod"], key: "arrowleft" }]),
    ).toBe(true);
  });
  it("treats missing as empty and compares order of hotkeys", () => {
    expect(sameHotkeys(undefined, [])).toBe(true);
    expect(sameHotkeys(undefined, HOTKEYS["app:go-back"])).toBe(false);
    const [a, b] = HOTKEYS["app:go-back"];
    expect(sameHotkeys([a, b], [b, a])).toBe(false);
  });
});

describe("core plugins", () => {
  it("Bases on and Unique note creator off, whatever is installed", () => {
    expect(wantedCorePlugins(() => false)).toEqual({ bases: true, "zk-prefixer": false });
  });
  it("Templates off only while Templater is loaded, Backlinks off only while Backlinks Full View is", () => {
    expect(wantedCorePlugins(id => id === "templater-obsidian")).toEqual({
      bases: true,
      templates: false,
      "zk-prefixer": false,
    });
    expect(wantedCorePlugins(() => true)).toEqual({
      bases: true,
      templates: false,
      "zk-prefixer": false,
      backlink: false,
    });
  });
  it("describes the rules in the setting", () => {
    expect(corePluginsDescription()).toBe(
      "Keeps Bases on and Unique note creator off; Templates off while Templater is enabled and Backlinks off while " +
        "Backlinks Full View is enabled, which replace them.",
    );
  });
});

describe("hotkeys", () => {
  it("keeps Obsidian's own back / forward hotkeys next to the added ones", () => {
    expect(HOTKEYS["app:go-back"]).toContainEqual({ modifiers: ["Mod", "Alt"], key: "ArrowLeft" });
    expect(HOTKEYS["app:go-forward"]).toContainEqual({ modifiers: ["Mod", "Alt"], key: "ArrowRight" });
  });
  it("Templater: Alt+N creates a new note from a template; the insert modal has none", () => {
    expect(HOTKEYS["templater-obsidian:create-new-note-from-template"]).toEqual([{ modifiers: ["Alt"], key: "N" }]);
    expect(HOTKEYS["templater-obsidian:insert-templater"]).toEqual([]);
    // an Alt+N saved on the insert modal earlier differs, so it gets cleared
    expect(sameHotkeys([{ modifiers: ["Alt"], key: "N" }], HOTKEYS["templater-obsidian:insert-templater"])).toBe(false);
  });
  it("has a name for every command, for notices while its plugin isn't installed", () => {
    expect(HOTKEY_NAMES["templater-obsidian:create-new-note-from-template"]).toBe(
      "Templater: Create new note from template",
    );
    expect(Object.keys(HOTKEY_NAMES)).toEqual(Object.keys(HOTKEYS));
  });
  it("describes them in the setting, with this platform's key names", () => {
    expect(hotkeysDescription(false)).toBe(
      "Navigate back: Ctrl+Alt+← and Ctrl+[. Navigate forward: Ctrl+Alt+→ and Ctrl+]. " +
        "Templater: Create new note from template: Alt+N. Templater: Open insert template modal: no hotkey.",
    );
    expect(hotkeysDescription(true)).toMatch(/^Navigate back: Cmd\+Option\+← and Cmd\+\[\./);
  });
});

describe("hotkey clashes", () => {
  const templater = {
    "templater-obsidian:create-new-note-from-template": HOTKEYS["templater-obsidian:create-new-note-from-template"],
  };
  it("finds another command with an enforced hotkey, own or default, Mod written as Ctrl", () => {
    const clashes = hotkeyClashes(
      {
        "editor:toggle-bold": [{ modifiers: ["Alt"], key: "n" }],
        "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }],
        "x:fine": [{ modifiers: ["Alt", "Shift"], key: "N" }],
        "app:go-back": HOTKEYS["app:go-back"],
        ...templater,
      },
      false,
    );
    expect(clashes).toEqual([
      { command: "app:go-back", other: "x:outdent", label: "Ctrl+[" },
      { command: "templater-obsidian:create-new-note-from-template", other: "editor:toggle-bold", label: "Alt+N" },
    ]);
  });
  it("an enforced command that doesn't exist (Templater not installed) clashes with nothing", () => {
    expect(hotkeyClashes({ "editor:toggle-bold": [{ modifiers: ["Alt"], key: "N" }] }, false)).toEqual([]);
  });
  it("on macOS Mod is Cmd, so Ctrl+[ doesn't clash with Mod+[", () => {
    const back = { "app:go-back": HOTKEYS["app:go-back"] };
    expect(hotkeyClashes({ ...back, "x:outdent": [{ modifiers: ["Ctrl"], key: "[" }] }, true)).toEqual([]);
    expect(hotkeyClashes({ ...back, "x:a": [{ modifiers: ["Meta", "Alt"], key: "ArrowLeft" }] }, true)).toEqual([
      { command: "app:go-back", other: "x:a", label: "Cmd+Option+←" },
    ]);
  });
  it("labels arrows and modifiers in a fixed order", () => {
    expect(hotkeyLabel({ modifiers: ["Alt", "Mod"], key: "ArrowRight" }, false)).toBe("Ctrl+Alt+→");
  });
});

describe("vault config", () => {
  const rule = (key: string) => CONFIG_RULES.find(r => r.key === key)!;
  it("keeps the link format and trash option from defaults.json, named as Obsidian names them", () => {
    const link = rule("newLinkFormat");
    expect(link.value(DEFAULTS)).toBe("absolute");
    expect(link.what("absolute")).toBe('New link format: "Absolute path in vault"');
    expect(rule("trashOption").what("local")).toBe('Deleted files: "Move to Obsidian trash"');
  });
  it("keeps the attachment folder of the setting, trimmed; an empty one keeps nothing", () => {
    const att = rule("attachmentFolderPath");
    expect(att.value({ ...DEFAULTS, attachmentFolder: " assets " })).toBe("assets");
    expect(att.value({ ...DEFAULTS, attachmentFolder: "  " })).toBe("");
    expect(att.setting).toBe("forceAttachments");
  });
});
