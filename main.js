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
var import_obsidian3 = require("obsidian");

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
function trailingAliasFix(before, only) {
  const m = TRAILING_LINK.exec(before);
  if (!m || only !== void 0 && m[2] !== only) return null;
  return { from: m.index, text: `[[${m[1]}]]` };
}

// src/properties.ts
var import_obsidian = require("obsidian");
var ISO_FIELDS = {
  date: { placeholder: "YYYY-MM-DD", picker: "date" },
  datetime: { placeholder: "YYYY-MM-DD HH:mm:ss", picker: "datetime-local" }
};
function pickedText(type, picked) {
  if (type === "date") return picked.slice(0, 10);
  const t = picked.slice(0, 19);
  return shownDateTime(t.length === 16 ? `${t}:00` : t);
}
function shownDateTime(value) {
  return value.replace(/^(\d{4}-\d{2}-\d{2})T/, "$1 ");
}
function isoDateTime(text) {
  return text.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(?=\d)/, "$1T");
}
function pickerValue(type, text) {
  const t = text.trim();
  if (type === "date") return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(t);
  if (!m) return "";
  const time = m[2] ?? "00:00:00";
  return `${m[1]}T${time.length === 5 ? `${time}:00` : time}`;
}
function isIsoText(type, text) {
  const t = text.trim();
  if (t === "") return true;
  if (type === "date") return (0, import_obsidian.moment)(t, "YYYY-MM-DD", true).isValid();
  return (0, import_obsidian.moment)(isoDateTime(t), ["YYYY-MM-DD[T]HH:mm:ss", "YYYY-MM-DD[T]HH:mm", "YYYY-MM-DD"], true).isValid();
}
function isoifyWidget(type, widget, el) {
  const input = widget?.inputEl;
  if (!widget || !input || input.dataset.isoDate) return;
  input.dataset.isoDate = "1";
  if (type === "datetime" && /T\d{2}:\d{2}$/.test(input.value)) input.value += ":00";
  input.type = "text";
  const parse = widget.parse?.bind(widget);
  if (parse)
    widget.parse = (text) => {
      const ok = isIsoText(type, text);
      input.toggleClass("is-invalid", !ok);
      input.setAttr("aria-invalid", ok ? "false" : "true");
      input.style.outline = ok ? "" : "1px solid var(--text-error)";
      input.title = ok ? "" : `Use ${ISO_FIELDS[type].placeholder}`;
      parse(ok ? type === "datetime" ? isoDateTime(text) : text : "not a date");
    };
  if (type === "datetime") {
    input.value = shownDateTime(input.value);
    const setValue = widget.setValue?.bind(widget);
    if (setValue)
      widget.setValue = (value) => {
        setValue(value);
        input.value = shownDateTime(input.value);
      };
  }
  input.placeholder = ISO_FIELDS[type].placeholder;
  input.spellcheck = false;
  const button = el.createDiv({
    cls: "clickable-icon iso-date-picker",
    attr: { "aria-label": "Pick a date", role: "button", tabindex: "0" }
  });
  (0, import_obsidian.setIcon)(button, "calendar");
  const picker = el.createEl("input", {
    cls: "iso-date-hidden-picker",
    // step 1: the date & time picker offers seconds too
    attr: { type: ISO_FIELDS[type].picker, step: "1", tabindex: "-1", "aria-hidden": "true" }
  });
  picker.setCssStyles({ position: "absolute", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  el.addClass("iso-date-host");
  button.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      button.click();
    }
  });
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    picker.value = pickerValue(type, input.value);
    try {
      picker.showPicker();
    } catch {
      picker.focus();
      picker.click();
    }
  });
  picker.addEventListener("change", () => {
    if (!picker.value) return;
    input.value = pickedText(type, picker.value);
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
  });
}

// src/settings.ts
var import_obsidian2 = require("obsidian");
var DEFAULTS = {
  forceRootPaths: true,
  stripAlias: true,
  forceAttachments: true,
  attachmentFolder: "u",
  forceTrash: true,
  forceCorePlugins: true,
  forceHotkeys: true,
  isoDates: true
};
var EditorDefaultsTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  toggle(name, desc, key) {
    new import_obsidian2.Setting(this.containerEl).setName(name).setDesc(desc).addToggle(
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
    new import_obsidian2.Setting(containerEl).setName("Attachment folder").setDesc("Path from the vault root.").addText((t) => {
      t.setValue(this.plugin.settings.attachmentFolder).onChange((v) => {
        this.plugin.settings.attachmentFolder = v;
      });
      t.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
    });
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
    this.toggle(
      "Dates in properties as YYYY-MM-DD (date & time with seconds)",
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker. Reopen notes after changing this.",
      "isoDates"
    );
  }
};

// src/main.ts
var EditorDefaultsPlugin = class extends import_obsidian3.Plugin {
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
      this.patchDateWidgets();
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
  /** Date / Date & time property widgets: ISO text fields (see properties.ts). Undone on unload. */
  patchDateWidgets() {
    const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
    if (!widgets) return;
    const plugin = this;
    for (const type of ["date", "datetime"]) {
      const w = widgets[type];
      if (typeof w?.render !== "function") continue;
      this.register(
        around(w, {
          render: (next) => function(el, value, ctx) {
            const widget = next.call(this, el, value, ctx);
            if (plugin.settings.isoDates) {
              try {
                isoifyWidget(type, widget, el);
              } catch (e) {
                console.error("[editor-defaults] could not change the date field", e);
              }
            }
            return widget;
          }
        })
      );
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
            const name = item?.type === "file" ? item.file?.basename : void 0;
            const result = next.call(this, item, evt);
            if (editor && name && plugin.settings.stripAlias) stripAliasBeforeCursor(editor, name);
            return result;
          }
        })
      );
    }
  }
};
function stripAliasBeforeCursor(editor, name) {
  const cursor = editor.getCursor();
  const fix = trailingAliasFix(editor.getLine(cursor.line).slice(0, cursor.ch), name);
  if (!fix) return;
  editor.replaceRange(fix.text, { line: cursor.line, ch: fix.from }, cursor);
  editor.setCursor({ line: cursor.line, ch: fix.from + fix.text.length });
}
