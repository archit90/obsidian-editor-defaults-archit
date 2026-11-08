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
  ],
  // Templater: Alt+N creates a new note from a template; "Open insert template modal" (which inserts into the
  // open note) gets no hotkey, so an Alt+N saved on it earlier goes
  "templater-obsidian:create-new-note-from-template": [{ modifiers: ["Alt"], key: "N" }],
  "templater-obsidian:insert-templater": []
};
function sameHotkeys(a, b) {
  const norm = (ks) => JSON.stringify((ks ?? []).map((k) => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
  return norm(a) === norm(b);
}
var ARROWS = { arrowleft: "\u2190", arrowright: "\u2192", arrowup: "\u2191", arrowdown: "\u2193" };
function comboKey(k, isMac) {
  const mods = new Set(k.modifiers.map((m) => m === "Mod" ? isMac ? "Meta" : "Ctrl" : m));
  return [...["Ctrl", "Meta", "Alt", "Shift"].filter((m) => mods.has(m)), k.key.toLowerCase()].join("+");
}
function hotkeyLabel(k, isMac) {
  return comboKey(k, isMac).split("+").map((p, i, all) => {
    if (i < all.length - 1) return p === "Meta" ? isMac ? "Cmd" : "Win" : isMac && p === "Alt" ? "Option" : p;
    return ARROWS[p] ?? (p.length === 1 ? p.toUpperCase() : p);
  }).join("+");
}
function hotkeyClashes(effective, isMac) {
  const out = [];
  for (const [command, keys] of Object.entries(HOTKEYS))
    for (const k of keys) {
      const want = comboKey(k, isMac);
      for (const [other, theirs] of Object.entries(effective)) {
        if (other in HOTKEYS) continue;
        if (theirs.some((t) => comboKey(t, isMac) === want)) out.push({ command, other, label: hotkeyLabel(k, isMac) });
      }
    }
  return out;
}

// src/drift.ts
var ENFORCED_CONFIG = /* @__PURE__ */ new Set(["newLinkFormat", "attachmentFolderPath", "trashOption"]);
var DriftGuard = class {
  constructor(max = 5, windowMs = 1e4) {
    this.max = max;
    this.windowMs = windowMs;
    this.times = /* @__PURE__ */ new Map();
    this.warned = /* @__PURE__ */ new Set();
  }
  /** Whether item `id` may be put back again at `now`. */
  allow(id, now) {
    const recent = (this.times.get(id) ?? []).filter((t) => now - t < this.windowMs);
    this.times.set(id, recent);
    if (recent.length < this.max) return true;
    if (!this.warned.has(id)) {
      this.warned.add(id);
      console.warn(`[editor-defaults] ${id} keeps changing back; not enforcing it again for now`);
    }
    return false;
  }
  record(id, now) {
    this.times.set(id, [...this.times.get(id) ?? [], now]);
  }
};
function list(items) {
  return items.length < 2 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
function revertNotice(whats, settingNames) {
  const names = [...new Set(settingNames)].map((n) => `"${n}"`);
  return `Editor Defaults (Archit) put back ${list(whats)}.
To change ${whats.length > 1 ? "these" : "this"}, first turn off ${list(names)} in the Editor Defaults (Archit) settings.`;
}

// src/links.ts
var WIKILINK = /\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g;
function linkAt(line, ch) {
  for (const m of line.matchAll(WIKILINK)) {
    const from = m.index;
    const to = from + m[0].length;
    if (ch <= from || ch > to) continue;
    const target = m[1] ?? "";
    const hash = target.indexOf("#");
    return {
      from,
      to,
      path: hash < 0 ? target : target.slice(0, hash),
      subpath: hash < 0 ? "" : target.slice(hash),
      alias: m[2]
    };
  }
  return null;
}
function fixPickedLink(line, ch, fix) {
  const l = linkAt(line, ch);
  if (!l) return null;
  const alias = fix.dropAlias !== void 0 && l.alias === fix.dropAlias ? void 0 : l.alias;
  const path = fix.path ?? l.path;
  if (alias === l.alias && path === l.path) return null;
  const text = `[[${path}${l.subpath}${alias !== void 0 ? `|${alias}` : ""}]]`;
  const oldPathEnd = 2 + l.path.length;
  const oldTargetEnd = oldPathEnd + l.subpath.length;
  const oldAliasEnd = oldTargetEnd + (l.alias !== void 0 ? 1 + l.alias.length : 0);
  const newPathEnd = 2 + path.length;
  const newTargetEnd = newPathEnd + l.subpath.length;
  const newAliasEnd = newTargetEnd + (alias !== void 0 ? 1 + alias.length : 0);
  const off = ch - l.from;
  let at;
  if (off <= oldPathEnd) at = off === oldPathEnd ? newPathEnd : Math.min(off, newPathEnd);
  else if (off <= oldTargetEnd) at = off - oldPathEnd + newPathEnd;
  else if (off <= oldAliasEnd) at = alias !== void 0 ? off - oldTargetEnd + newTargetEnd : newTargetEnd;
  else at = off - oldAliasEnd + newAliasEnd;
  return { from: l.from, to: l.to, text, ch: l.from + at };
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
function canonicalText(type, text) {
  const t = text.trim();
  if (t === "" || !isIsoText(type, t)) return text;
  if (type === "date") return t;
  const m = (0, import_obsidian.moment)(isoDateTime(t), ["YYYY-MM-DD[T]HH:mm:ss", "YYYY-MM-DD[T]HH:mm", "YYYY-MM-DD"], true);
  return m.format("YYYY-MM-DD HH:mm:ss");
}
function invalidDateNotice(type, typed, stored) {
  const back = stored.trim() === "" ? "empty" : `"${type === "datetime" ? canonicalText(type, shownDateTime(stored)) : stored}"`;
  return `"${typed.trim()}" isn't a valid ${type === "datetime" ? "date & time" : "date"} (use ${ISO_FIELDS[type].placeholder}), so it wasn't saved. The field is back to ${back}.`;
}
function isoifyWidget(type, widget, el) {
  const input = widget?.inputEl;
  if (!widget || !input || input.dataset.isoDate) return;
  input.dataset.isoDate = "1";
  const shown = (v) => type === "datetime" ? canonicalText(type, shownDateTime(v)) : v;
  const value = input.value;
  input.type = "text";
  input.value = shown(value);
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
    const setValue = widget.setValue?.bind(widget);
    if (setValue)
      widget.setValue = (value2) => {
        setValue(value2);
        input.value = shown(input.value);
      };
  }
  input.addEventListener("blur", () => {
    if (input.getAttr("aria-invalid") === "true") {
      const typed = input.value;
      const stored = widget.value ?? "";
      if (widget.setValue) widget.setValue(stored);
      else {
        input.value = shown(stored);
        widget.parse?.(input.value);
      }
      new import_obsidian.Notice(invalidDateNotice(type, typed, stored));
      return;
    }
    const text = canonicalText(type, input.value);
    if (text !== input.value) input.value = text;
  });
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
var SETTING_NAMES = {
  forceRootPaths: "New links use path from vault root",
  stripAlias: "Insert [[path]] without alias",
  forceAttachments: "Keep attachments in one folder",
  attachmentFolder: "Attachment folder",
  forceTrash: "Deleted files go to the Obsidian trash",
  forceCorePlugins: "Enforce core plugins",
  forceHotkeys: "Enforce hotkeys",
  isoDates: "Dates in properties as YYYY-MM-DD (date & time with seconds)"
};
var BOOL_KEYS = [
  "forceRootPaths",
  "stripAlias",
  "forceAttachments",
  "forceTrash",
  "forceCorePlugins",
  "forceHotkeys",
  "isoDates"
];
function parseSettings(raw) {
  const out = { ...DEFAULTS };
  if (typeof raw !== "object" || raw === null) return out;
  const get = (key) => Object.hasOwn(raw, key) ? Reflect.get(raw, key) : void 0;
  for (const key of BOOL_KEYS) {
    const v = get(key);
    if (typeof v === "boolean") out[key] = v;
  }
  const folder = get("attachmentFolder");
  if (typeof folder === "string") out.attachmentFolder = folder;
  return out;
}
var EditorDefaultsTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  toggle(desc, key) {
    new import_obsidian2.Setting(this.containerEl).setName(SETTING_NAMES[key]).setDesc(desc).addToggle(
      (t) => t.setValue(this.plugin.settings[key]).onChange(async (v) => {
        this.plugin.settings[key] = v;
        if (key === "isoDates") await this.plugin.isoDatesChanged();
        else await this.plugin.saveSettings();
      })
    );
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "While one of these is on, Editor Defaults (Archit) puts its value back whenever it changes: in Obsidian's settings, from another device, or by another plugin. Turn it off here to change that value yourself."
    });
    this.toggle(
      'Keeps "New link format" set to "Absolute path in vault". Heading and block links picked from the [[ dropdown get the full path too.',
      "forceRootPaths"
    );
    this.toggle(
      "Picking a note from the [[ dropdown inserts only the link target, not [[path|name]]. Works with absolute and relative link formats, in notes and in properties.",
      "stripAlias"
    );
    this.toggle('Keeps "Default location for new attachments" set to the folder below.', "forceAttachments");
    new import_obsidian2.Setting(containerEl).setName(SETTING_NAMES.attachmentFolder).setDesc("Path from the vault root.").addText((t) => {
      t.setValue(this.plugin.settings.attachmentFolder).onChange((v) => {
        this.plugin.settings.attachmentFolder = v;
      });
      t.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
    });
    this.toggle('Keeps "Deleted files" set to "Move to Obsidian trash (.trash folder)".', "forceTrash");
    this.toggle("Keeps Bases on, and Templates, Unique note creator and Backlinks off.", "forceCorePlugins");
    this.toggle(
      "Navigate back: Ctrl/Cmd+Alt+\u2190 and Ctrl/Cmd+[. Navigate forward: Ctrl/Cmd+Alt+\u2192 and Ctrl/Cmd+]. Templater, create new note from template: Alt+N (and no hotkey on its insert template modal).",
      "forceHotkeys"
    );
    this.toggle(
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker.",
      "isoDates"
    );
  }
};

// src/main.ts
function linkSuggestion(item) {
  if (typeof item !== "object" || item === null) return {};
  return {
    file: "file" in item && item.file instanceof import_obsidian3.TFile ? item.file : void 0,
    type: "type" in item && typeof item.type === "string" ? item.type : void 0
  };
}
function isPropertyLinkSuggestProto(proto) {
  return typeof proto === "object" && proto !== null && Object.hasOwn(proto, "selectSuggestion") && Object.hasOwn(proto, "getLinktextQuery") && "selectSuggestion" in proto && typeof proto.selectSuggestion === "function";
}
var DRIFT_DELAY_MS = 300;
var EditorDefaultsPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULTS };
    this.applying = false;
    this.driftTimer = null;
    this.guard = new DriftGuard();
    /** Hotkey clashes already warned about this session ("other command|hotkey"). */
    this.warnedClashes = /* @__PURE__ */ new Set();
  }
  async onload() {
    this.settings = parseSettings(await this.loadData());
    this.addSettingTab(new EditorDefaultsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      void this.applyDefaults().then(() => this.warnHotkeyClashes());
      this.watchDrift();
      this.patchLinkSuggest();
      this.patchPropertyLinkSuggest();
      this.patchDateWidgets();
      if (this.settings.isoDates) this.rerenderDateFields();
    });
  }
  onunload() {
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    if (this.settings.isoDates) this.rerenderDateFields();
  }
  async saveSettings() {
    await this.saveData(this.settings);
    await this.applyDefaults();
  }
  /** The "Dates in properties" setting changed: redraw the date fields of open notes and Bases. */
  async isoDatesChanged() {
    await this.saveSettings();
    this.rerenderDateFields();
  }
  /**
   * Writes each enabled default into the vault config if it differs, except the items `skip` names. Returns
   * what was set. Saving the plugin's settings applies the defaults too, so turning a setting on applies it at once.
   */
  async applyDefaults(skip = () => false) {
    const s = this.settings;
    const out = [];
    const config = (key, value, what, setting) => {
      if (!skip(key) && this.setConfig(key, value)) out.push({ id: key, what, setting });
    };
    this.applying = true;
    try {
      if (s.forceRootPaths)
        config("newLinkFormat", "absolute", 'New link format: "Absolute path in vault"', "forceRootPaths");
      const folder = s.attachmentFolder.trim();
      if (s.forceAttachments && folder)
        config("attachmentFolderPath", folder, `Attachment folder: "${folder}"`, "forceAttachments");
      if (s.forceTrash) config("trashOption", "local", 'Deleted files: "Move to Obsidian trash"', "forceTrash");
      if (s.forceCorePlugins)
        for (const [id, what] of await this.applyCorePlugins(skip)) out.push({ id, what, setting: "forceCorePlugins" });
      if (s.forceHotkeys)
        for (const [id, what] of await this.applyHotkeys(skip)) out.push({ id, what, setting: "forceHotkeys" });
    } finally {
      this.applying = false;
    }
    return out;
  }
  /**
   * "Enforces vault settings on every device, on load and whenever they drift": a change made by hand (Settings →
   * Files and links, Core plugins, Hotkeys), by a synced app.json / hotkeys.json, or by another plugin is put
   * back, with a notice that names the Editor Defaults setting to turn off for changing it.
   */
  watchDrift() {
    this.registerEvent(
      this.app.vault.on("config-changed", (key) => {
        if (ENFORCED_CONFIG.has(key)) this.requestEnforce();
      })
    );
    const core = this.app.internalPlugins;
    if (typeof core?.on === "function") this.registerEvent(core.on("change", () => this.requestEnforce()));
    const hm = this.app.hotkeyManager;
    const plugin = this;
    if (hm && typeof hm.save === "function")
      this.register(
        around(hm, {
          save: (next) => async function() {
            await next.call(this);
            plugin.requestEnforce();
          }
        })
      );
    const hotkeysFile = `${this.app.vault.configDir}/hotkeys.json`;
    this.registerEvent(
      this.app.vault.on("raw", (path) => {
        if (path === hotkeysFile) this.requestEnforce();
      })
    );
  }
  requestEnforce() {
    if (this.applying) return;
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    this.driftTimer = window.setTimeout(() => {
      this.driftTimer = null;
      void this.enforce();
    }, DRIFT_DELAY_MS);
  }
  async enforce() {
    const now = Date.now();
    const reverted = await this.applyDefaults((id) => !this.guard.allow(id, now));
    this.warnHotkeyClashes();
    if (!reverted.length) return;
    for (const r of reverted) this.guard.record(r.id, now);
    new import_obsidian3.Notice(
      revertNotice(
        reverted.map((r) => r.what),
        reverted.map((r) => SETTING_NAMES[r.setting])
      ),
      8e3
    );
    const tab = this.app.setting?.isOpen ? this.app.setting.activeTab : null;
    if (typeof tab?.onHotkeysChanged === "function") tab.onHotkeysChanged();
    else if (tab && typeof tab.display === "function") {
      const top = tab.containerEl?.scrollTop ?? 0;
      tab.display();
      if (tab.containerEl) tab.containerEl.scrollTop = top;
    }
  }
  /**
   * Warns (once per clash per session) when another command has one of the hotkeys set here (Alt+N, Navigate
   * back / forward): Obsidian runs only one of them. The other command's hotkey is left alone.
   */
  warnHotkeyClashes() {
    const hm = this.app.hotkeyManager;
    const commands = { ...this.app.commands?.editorCommands, ...this.app.commands?.commands };
    if (!this.settings.forceHotkeys || !hm) return;
    const effective = {};
    for (const id of Object.keys(commands)) effective[id] = hm.getHotkeys?.(id) ?? hm.getDefaultHotkeys?.(id) ?? [];
    for (const c of hotkeyClashes(effective, import_obsidian3.Platform.isMacOS)) {
      const key = `${c.other}|${c.label}`;
      if (this.warnedClashes.has(key)) continue;
      this.warnedClashes.add(key);
      const name = (id) => this.app.commands?.findCommand?.(id)?.name ?? commands[id]?.name ?? id;
      new import_obsidian3.Notice(
        `Editor Defaults (Archit): ${c.label} (${name(c.command)}) is also the hotkey of "${name(c.other)}", so it may run that instead. Change or remove one of them in Settings \u2192 Hotkeys.`,
        1e4
      );
    }
  }
  /** Sets each command in HOTKEYS to exactly its listed hotkeys (written to .obsidian/hotkeys.json). */
  async applyHotkeys(skip) {
    const hm = this.app.hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return [];
    const changed = [];
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (skip(id)) continue;
      const now = hm.getHotkeys?.(id);
      if (now !== void 0 && sameHotkeys(now, keys)) continue;
      hm.setHotkeys(
        id,
        keys.map((k) => ({ modifiers: [...k.modifiers], key: k.key }))
      );
      changed.push([id, `the hotkeys of "${this.app.commands?.findCommand?.(id)?.name ?? id}"`]);
    }
    if (changed.length) {
      try {
        await hm.save?.();
      } catch (e) {
        console.error("[editor-defaults] could not save hotkeys", e);
      }
    }
    return changed;
  }
  /** Sets a vault config value if it differs; whether it did. */
  setConfig(key, value) {
    const vault = this.app.vault;
    if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return false;
    if (vault.getConfig(key) === value) return false;
    vault.setConfig(key, value);
    return true;
  }
  async applyCorePlugins(skip) {
    const plugins = this.app.internalPlugins?.plugins;
    if (!plugins) return [];
    const changed = [];
    for (const [id, want] of Object.entries(CORE_PLUGINS)) {
      const p = plugins[id];
      if (!p || p.enabled === want || skip(id)) continue;
      try {
        if (want) await p.enable?.(true);
        else await p.disable?.(true);
        changed.push([id, `core plugin ${p.instance?.name ?? id} ${want ? "on" : "off"}`]);
      } catch (e) {
        console.error(`[editor-defaults] could not ${want ? "enable" : "disable"} core plugin ${id}`, e);
      }
    }
    return changed;
  }
  /**
   * Redraws every Date / Date & time property field (notes in tabs, lanes and canvas cards, the File properties
   * view, Bases tabs), so turning "Dates in properties" on or off, or the plugin, shows at once. Obsidian redraws a
   * property everywhere when its type changes ("changed" on the metadata type manager); nothing is saved.
   */
  rerenderDateFields() {
    const mtm = this.app.metadataTypeManager;
    if (!mtm || typeof mtm.trigger !== "function") return;
    const props = mtm.getAllProperties?.() ?? {};
    for (const [key, info] of Object.entries(props))
      if (info?.widget === "date" || info?.widget === "datetime") mtm.trigger("changed", key);
    for (const leaf of this.app.workspace.getLeavesOfType("bases")) void leaf.rebuildView?.();
  }
  /** Date / Date & time property widgets: ISO text fields (see properties.ts). Undone on unload. */
  patchDateWidgets() {
    const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
    if (!widgets) return;
    const plugin = this;
    const types = ["date", "datetime"];
    for (const type of types) {
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
  /**
   * What to change in a link just picked from a [[ dropdown: the note name Obsidian adds as an alias to a note
   * pick, and, for a heading or block pick (where Obsidian keeps the note name as typed), the path from the
   * vault root when new links use it.
   */
  pickFix(raw, sourcePath) {
    const fix = {};
    const item = linkSuggestion(raw);
    const file = item.file;
    if (!file) return fix;
    if (item.type === "file" && this.settings.stripAlias) fix.dropAlias = file.basename;
    if ((item.type === "heading" || item.type === "block") && this.settings.forceRootPaths && this.app.vault.getConfig?.("newLinkFormat") === "absolute")
      fix.path = this.app.metadataCache.fileToLinktext(file, sourcePath, true);
    return fix;
  }
  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester in the editor (undone on unload). */
  patchLinkSuggest() {
    const suggests = this.app.workspace.editorSuggest?.suggests ?? [];
    const plugin = this;
    for (const suggest of suggests) {
      if (typeof suggest?.selectSuggestion !== "function") continue;
      this.register(
        around(suggest, {
          selectSuggestion: (next) => function(item, evt) {
            const editor = this.context?.editor;
            const fix = plugin.pickFix(item, this.context?.file?.path ?? "");
            const result = next.call(this, item, evt);
            if (editor && (fix.dropAlias !== void 0 || fix.path !== void 0)) fixLinkAtCursor(editor, fix);
            return result;
          }
        })
      );
    }
  }
  /**
   * The [[ suggester in property values is created per field, from a class Obsidian doesn't export. It is an
   * AbstractInputSuggest that shows its suggestions through the base class, so its prototype is patched the
   * first time one shows (undone on unload).
   */
  patchPropertyLinkSuggest() {
    const plugin = this;
    const patched = /* @__PURE__ */ new Set();
    const patchProto = (proto) => {
      patched.add(proto);
      this.register(
        around(proto, {
          selectSuggestion: (next) => function(item, evt) {
            const fix = plugin.pickFix(item, this.sourcePath ?? "");
            if (fix.dropAlias === void 0 && fix.path === void 0) return next.call(this, item, evt);
            const apply = (text, ch) => {
              const r = fixPickedLink(text, ch, fix);
              return r ? { text: text.slice(0, r.from) + r.text + text.slice(r.to), ch: r.ch } : null;
            };
            const onSelect = this.onSelectLink;
            let committed = false;
            if (typeof onSelect === "function")
              this.onSelectLink = (text, e) => {
                committed = true;
                onSelect.call(this, apply(text, text.length)?.text ?? text, e);
              };
            try {
              next.call(this, item, evt);
            } finally {
              this.onSelectLink = onSelect;
            }
            if (!committed) fixFieldLink(this.inputEl, apply);
          }
        })
      );
    };
    const base = import_obsidian3.AbstractInputSuggest.prototype;
    this.register(
      around(base, {
        showSuggestions: (next) => function(values) {
          try {
            const proto = Object.getPrototypeOf(this);
            if (isPropertyLinkSuggestProto(proto) && !patched.has(proto) && "onSelectLink" in this && typeof this.onSelectLink === "function")
              patchProto(proto);
          } catch (e) {
            console.error("[editor-defaults] could not patch the property link suggester", e);
          }
          return next.call(this, values);
        }
      })
    );
  }
};
function fixLinkAtCursor(editor, fix) {
  const cursor = editor.getCursor();
  const r = fixPickedLink(editor.getLine(cursor.line), cursor.ch, fix);
  if (!r) return;
  editor.replaceRange(r.text, { line: cursor.line, ch: r.from }, { line: cursor.line, ch: r.to });
  editor.setCursor({ line: cursor.line, ch: r.ch });
}
function fixFieldLink(el, apply) {
  const text = el.textContent ?? "";
  const sel = el.win.getSelection();
  let ch = text.length;
  if (sel && sel.focusNode && el.contains(sel.focusNode)) {
    const range = el.doc.createRange();
    range.setStart(el, 0);
    range.setEnd(sel.focusNode, sel.focusOffset);
    ch = range.toString().length;
  }
  const r = apply(text, ch);
  if (!r) return;
  el.textContent = r.text;
  if (sel && el.firstChild) sel.collapse(el.firstChild, r.ch);
  el.dispatchEvent(new Event("input"));
}
