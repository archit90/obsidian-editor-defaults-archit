"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EditorDefaultsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULTS = {
  forceRootPaths: true,
  stripAlias: true,
  forceAttachments: true,
  attachmentFolder: "u",
  forceTrash: true,
  forceCorePlugins: true,
  forceHotkeys: true
};
var CORE_PLUGINS = {
  bases: true,
  templates: false,
  // Templater replaces it
  "zk-prefixer": false,
  // "Unique note creator"
  backlink: false
  // Backlinks Full View's "All backlinks" pane replaces it
};
var HOTKEYS = {
  "app:go-back": [
    { modifiers: ["Mod", "Alt"], key: "ArrowLeft" },
    // Obsidian's default
    { modifiers: ["Mod"], key: "[" }
  ],
  "app:go-forward": [
    { modifiers: ["Mod", "Alt"], key: "ArrowRight" },
    // Obsidian's default
    { modifiers: ["Mod"], key: "]" }
  ]
};
var TRAILING_LINK = /\[\[([^\[\]|]+)\|([^\[\]]*)\]\]$/;
var EditorDefaultsPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULTS;
    this.restore = [];
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new EditorDefaultsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      void this.applyDefaults();
      this.patchLinkSuggest();
    });
  }
  onunload() {
    this.restore.forEach((fn) => fn());
    this.restore = [];
  }
  async saveSettings() {
    await this.saveData(this.settings);
    await this.applyDefaults();
  }
  /** Writes each enabled default into the vault config if it differs. */
  async applyDefaults() {
    const s = this.settings;
    if (s.forceRootPaths) this.setConfig("newLinkFormat", "absolute");
    if (s.forceAttachments && s.attachmentFolder.trim()) {
      this.setConfig("attachmentFolderPath", s.attachmentFolder.trim());
    }
    if (s.forceTrash) this.setConfig("trashOption", "local");
    if (s.forceCorePlugins) await this.applyCorePlugins();
    if (s.forceHotkeys) await this.applyHotkeys();
  }
  /** Sets each command in HOTKEYS to exactly its listed hotkeys (written to .obsidian/hotkeys.json). */
  async applyHotkeys() {
    var _a, _b;
    const hm = this.app.hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return;
    const norm = (ks) => JSON.stringify((ks != null ? ks : []).map((k) => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
    let changed = false;
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (norm((_a = hm.getHotkeys) == null ? void 0 : _a.call(hm, id)) === norm(keys)) continue;
      hm.setHotkeys(id, keys.map((k) => ({ modifiers: [...k.modifiers], key: k.key })));
      changed = true;
    }
    if (changed) {
      try {
        await ((_b = hm.save) == null ? void 0 : _b.call(hm));
      } catch (e) {
        console.error("[editor-defaults] could not save hotkeys", e);
      }
    }
  }
  setConfig(key, value) {
    const vault = this.app.vault;
    if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return;
    if (vault.getConfig(key) !== value) vault.setConfig(key, value);
  }
  async applyCorePlugins() {
    var _a, _b, _c;
    const plugins = (_a = this.app.internalPlugins) == null ? void 0 : _a.plugins;
    if (!plugins) return;
    for (const [id, want] of Object.entries(CORE_PLUGINS)) {
      const p = plugins[id];
      if (!p || p.enabled === want) continue;
      try {
        if (want) await ((_b = p.enable) == null ? void 0 : _b.call(p, true));
        else await ((_c = p.disable) == null ? void 0 : _c.call(p, true));
      } catch (e) {
        console.error(`[editor-defaults] could not ${want ? "enable" : "disable"} core plugin ${id}`, e);
      }
    }
  }
  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester. */
  patchLinkSuggest() {
    var _a, _b;
    const suggests = (_b = (_a = this.app.workspace.editorSuggest) == null ? void 0 : _a.suggests) != null ? _b : [];
    for (const suggest of suggests) {
      if (typeof (suggest == null ? void 0 : suggest.selectSuggestion) !== "function") continue;
      if (suggest.__editorDefaultsPatched) continue;
      const original = suggest.selectSuggestion;
      const plugin = this;
      suggest.__editorDefaultsPatched = true;
      suggest.selectSuggestion = function(item, evt) {
        var _a2;
        const editor = (_a2 = this.context) == null ? void 0 : _a2.editor;
        const isFileLink = item && item.file && ["file", "heading", "block", "linktext"].includes(item.type);
        const result = original.call(this, item, evt);
        if (editor && isFileLink && plugin.settings.stripAlias) {
          plugin.stripAliasBeforeCursor(editor);
        }
        return result;
      };
      this.restore.push(() => {
        suggest.selectSuggestion = original;
        delete suggest.__editorDefaultsPatched;
      });
    }
  }
  stripAliasBeforeCursor(editor) {
    const cursor = editor.getCursor();
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = TRAILING_LINK.exec(before);
    if (!m) return;
    const from = { line: cursor.line, ch: m.index };
    editor.replaceRange(`[[${m[1]}]]`, from, cursor);
    editor.setCursor({ line: cursor.line, ch: m.index + m[1].length + 4 });
  }
};
var EditorDefaultsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  toggle(name, desc, key) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addToggle(
      (t) => t.setValue(this.plugin.settings[key]).onChange(async (v) => {
        this.plugin.settings[key] = v;
        await this.plugin.saveSettings();
      })
    );
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.toggle(
      "New links use path from vault root",
      'Keeps "New link format" set to "Absolute path in vault".',
      "forceRootPaths"
    );
    this.toggle(
      "Insert [[path]] without alias",
      "Picking a note from the [[ dropdown inserts only the link target, not [[path|name]]. Works with absolute and relative link formats.",
      "stripAlias"
    );
    this.toggle(
      "Keep attachments in one folder",
      'Keeps "Default location for new attachments" set to the folder below.',
      "forceAttachments"
    );
    new import_obsidian.Setting(containerEl).setName("Attachment folder").setDesc("Path from the vault root.").addText(
      (t) => t.setValue(this.plugin.settings.attachmentFolder).onChange(async (v) => {
        this.plugin.settings.attachmentFolder = v;
        await this.plugin.saveSettings();
      })
    );
    this.toggle(
      "Deleted files go to the Obsidian trash",
      'Keeps "Deleted files" set to "Move to Obsidian trash (.trash folder)".',
      "forceTrash"
    );
    this.toggle(
      "Enforce core plugins",
      "Keeps Bases on, and Templates, Unique note creator and Backlinks off.",
      "forceCorePlugins"
    );
    this.toggle(
      "Enforce hotkeys",
      "Navigate back: Ctrl/Cmd+Alt+\u2190 and Ctrl/Cmd+[. Navigate forward: Ctrl/Cmd+Alt+\u2192 and Ctrl/Cmd+].",
      "forceHotkeys"
    );
  }
};
