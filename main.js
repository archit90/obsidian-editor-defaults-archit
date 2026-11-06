/*
GENERATED FILE, built by esbuild from src/. Edit the TypeScript sources, not this file.
*/

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

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => EditorDefaultsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// ../node_modules/monkey-around/dist/index.mjs
function around(obj, factories) {
  const removers = Object.keys(factories).map((key) => around1(obj, key, factories[key]));
  return removers.length === 1 ? removers[0] : function() {
    removers.forEach((r) => r());
  };
}
function around1(obj, method, createWrapper) {
  const inherited = obj[method], hadOwn = obj.hasOwnProperty(method), original = hadOwn ? inherited : function() {
    return Object.getPrototypeOf(obj)[method].apply(this, arguments);
  };
  let current = createWrapper(original);
  if (inherited)
    Object.setPrototypeOf(current, inherited);
  Object.setPrototypeOf(wrapper, current);
  obj[method] = wrapper;
  return remove;
  function wrapper(...args) {
    if (current === original && obj[method] === wrapper)
      remove();
    return current.apply(this, args);
  }
  function remove() {
    if (obj[method] === wrapper) {
      if (hadOwn)
        obj[method] = original;
      else
        delete obj[method];
    }
    if (current === original)
      return;
    current = original;
    Object.setPrototypeOf(wrapper, inherited || Function);
  }
}

// src/defaults.ts
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
function sameHotkeys(a, b) {
  const norm = (ks) => JSON.stringify((ks ?? []).map((k) => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
  return norm(a) === norm(b);
}

// src/links.ts
var TRAILING_LINK = /\[\[([^[\]|]+)\|([^[\]]*)\]\]$/;
function trailingAliasFix(before) {
  const m = TRAILING_LINK.exec(before);
  return m ? { from: m.index, text: `[[${m[1]}]]` } : null;
}

// src/settings.ts
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

// src/main.ts
var EditorDefaultsPlugin = class extends import_obsidian2.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULTS };
  }
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new EditorDefaultsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      void this.applyDefaults();
      this.patchLinkSuggest();
    });
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
    const hm = this.app.hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return;
    let changed = false;
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (sameHotkeys(hm.getHotkeys?.(id), keys)) continue;
      hm.setHotkeys(
        id,
        keys.map((k) => ({ modifiers: [...k.modifiers], key: k.key }))
      );
      changed = true;
    }
    if (changed) {
      try {
        await hm.save?.();
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
    const plugins = this.app.internalPlugins?.plugins;
    if (!plugins) return;
    for (const [id, want] of Object.entries(CORE_PLUGINS)) {
      const p = plugins[id];
      if (!p || p.enabled === want) continue;
      try {
        if (want) await p.enable?.(true);
        else await p.disable?.(true);
      } catch (e) {
        console.error(`[editor-defaults] could not ${want ? "enable" : "disable"} core plugin ${id}`, e);
      }
    }
  }
  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester (undone on unload). */
  patchLinkSuggest() {
    const suggests = this.app.workspace.editorSuggest?.suggests ?? [];
    const plugin = this;
    for (const suggest of suggests) {
      if (typeof suggest?.selectSuggestion !== "function" || suggest.__editorDefaultsPatched) continue;
      suggest.__editorDefaultsPatched = true;
      this.register(() => delete suggest.__editorDefaultsPatched);
      this.register(
        around(suggest, {
          selectSuggestion: (next) => function(item, evt) {
            const editor = this.context?.editor;
            const isFileLink = !!item?.file && ["file", "heading", "block", "linktext"].includes(item.type ?? "");
            const result = next.call(this, item, evt);
            if (editor && isFileLink && plugin.settings.stripAlias) stripAliasBeforeCursor(editor);
            return result;
          }
        })
      );
    }
  }
};
function stripAliasBeforeCursor(editor) {
  const cursor = editor.getCursor();
  const fix = trailingAliasFix(editor.getLine(cursor.line).slice(0, cursor.ch));
  if (!fix) return;
  editor.replaceRange(fix.text, { line: cursor.line, ch: fix.from }, cursor);
  editor.setCursor({ line: cursor.line, ch: fix.from + fix.text.length });
}
