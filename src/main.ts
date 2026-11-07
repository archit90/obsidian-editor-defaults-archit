import { AbstractInputSuggest, Editor, EditorSuggest, Hotkey, Notice, Platform, Plugin, TFile } from "obsidian";
import { around } from "monkey-around";
import { CORE_PLUGINS, HOTKEYS, hotkeyClashes, sameHotkeys } from "./defaults";
import { DriftGuard, ENFORCED_CONFIG, revertNotice } from "./drift";
import { fixPickedLink, PickFix } from "./links";
import { IsoType, isoifyWidget } from "./properties";
import { DEFAULTS, EditorDefaultsTab, parseSettings, SETTING_NAMES, Settings } from "./settings";

/** What the [[ link suggesters pass to selectSuggestion (only the fields used here). */
interface LinkSuggestion {
  file?: TFile;
  type?: string;
}

/** The fields of a suggestion item used here, read without trusting its shape. */
function linkSuggestion(item: unknown): LinkSuggestion {
  if (typeof item !== "object" || item === null) return {};
  return {
    file: "file" in item && item.file instanceof TFile ? item.file : undefined,
    type: "type" in item && typeof item.type === "string" ? item.type : undefined,
  };
}

/**
 * Obsidian's [[ suggester in property values (app.js `n5`, an AbstractInputSuggest): Enter or a click hands the
 * finished text to onSelectLink; Tab, `#` and `^` put it in the field and keep the dropdown open.
 */
interface PropertyLinkSuggest {
  inputEl: HTMLElement;
  sourcePath?: string;
  onSelectLink?: (text: string, evt: unknown) => void;
}

/** Its prototype: selectSuggestion and getLinktextQuery are its own (no other AbstractInputSuggest has the latter). */
interface PropertyLinkSuggestProto {
  selectSuggestion(this: PropertyLinkSuggest, item: unknown, evt: unknown): void;
  getLinktextQuery(text: string): string;
}

function isPropertyLinkSuggestProto(proto: unknown): proto is PropertyLinkSuggestProto {
  return (
    typeof proto === "object" &&
    proto !== null &&
    Object.hasOwn(proto, "selectSuggestion") &&
    Object.hasOwn(proto, "getLinktextQuery") &&
    "selectSuggestion" in proto &&
    typeof proto.selectSuggestion === "function"
  );
}

/** How long to wait after a vault setting, core plugin or hotkey changes before checking it. */
const DRIFT_DELAY_MS = 300;

/** One enforced default that was set: its id (config key, core plugin or command), what it is now, and the setting that keeps it. */
interface Revert {
  id: string;
  what: string;
  setting: keyof Settings;
}

export default class EditorDefaultsPlugin extends Plugin {
  override settings: Settings = { ...DEFAULTS };
  private applying = false;
  private driftTimer: number | null = null;
  private guard = new DriftGuard();
  /** Hotkey clashes already warned about this session ("other command|hotkey"). */
  private warnedClashes = new Set<string>();

  override async onload() {
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

  override onunload() {
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    // the date widgets are unpatched by now: open notes get Obsidian's own date fields back
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
  async applyDefaults(skip: (id: string) => boolean = () => false): Promise<Revert[]> {
    const s = this.settings;
    const out: Revert[] = [];
    const config = (key: string, value: string, what: string, setting: keyof Settings) => {
      if (!skip(key) && this.setConfig(key, value)) out.push({ id: key, what, setting });
    };
    this.applying = true;
    try {
      // "absolute" == "Absolute path in vault" (path from the vault root)
      if (s.forceRootPaths)
        config("newLinkFormat", "absolute", 'New link format: "Absolute path in vault"', "forceRootPaths");
      const folder = s.attachmentFolder.trim();
      if (s.forceAttachments && folder)
        config("attachmentFolderPath", folder, `Attachment folder: "${folder}"`, "forceAttachments");
      // "local" == Obsidian trash (.trash), "system" == OS trash, "none" == delete permanently
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
  private watchDrift() {
    this.registerEvent(
      this.app.vault.on("config-changed", (key: string) => {
        if (ENFORCED_CONFIG.has(key)) this.requestEnforce();
      }),
    );
    const core = this.app.internalPlugins;
    if (typeof core?.on === "function") this.registerEvent(core.on("change", () => this.requestEnforce()));
    const hm = this.app.hotkeyManager;
    const plugin = this;
    // the Hotkeys tab saves after each change
    if (hm && typeof hm.save === "function")
      this.register(
        around(hm, {
          save: next =>
            async function (this: unknown) {
              await next.call(this);
              plugin.requestEnforce();
            },
        }),
      );
    // a hotkeys.json changed on disk (sync) is loaded again by Obsidian 50 ms later; the check comes after that
    const hotkeysFile = `${this.app.vault.configDir}/hotkeys.json`;
    this.registerEvent(
      this.app.vault.on("raw", (path: string) => {
        if (path === hotkeysFile) this.requestEnforce();
      }),
    );
  }

  private requestEnforce() {
    if (this.applying) return;
    if (this.driftTimer !== null) window.clearTimeout(this.driftTimer);
    this.driftTimer = window.setTimeout(() => {
      this.driftTimer = null;
      void this.enforce();
    }, DRIFT_DELAY_MS);
  }

  private async enforce() {
    // something else that keeps setting one back (another plugin) would make the two fight forever
    const now = Date.now();
    const reverted = await this.applyDefaults(id => !this.guard.allow(id, now));
    this.warnHotkeyClashes();
    if (!reverted.length) return;
    for (const r of reverted) this.guard.record(r.id, now);
    new Notice(
      revertNotice(
        reverted.map(r => r.what),
        reverted.map(r => SETTING_NAMES[r.setting]),
      ),
      8000,
    );
    // an open Settings tab (Files and links, Core plugins, Hotkeys) still shows the value just undone
    const tab = this.app.setting?.isOpen ? this.app.setting.activeTab : null;
    // the Hotkeys tab redraws its list and keeps its filter; other tabs are drawn again where they were scrolled
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
  private warnHotkeyClashes() {
    const hm = this.app.hotkeyManager;
    // editor commands are only in `commands` while an editor has focus; `editorCommands` always has them
    const commands = { ...this.app.commands?.editorCommands, ...this.app.commands?.commands };
    if (!this.settings.forceHotkeys || !hm) return;
    const effective: Record<string, Hotkey[]> = {};
    for (const id of Object.keys(commands)) effective[id] = hm.getHotkeys?.(id) ?? hm.getDefaultHotkeys?.(id) ?? [];
    for (const c of hotkeyClashes(effective, Platform.isMacOS)) {
      const key = `${c.other}|${c.label}`;
      if (this.warnedClashes.has(key)) continue;
      this.warnedClashes.add(key);
      const name = (id: string) => this.app.commands?.findCommand?.(id)?.name ?? commands[id]?.name ?? id;
      new Notice(
        `Editor Defaults: ${c.label} (${name(c.command)}) is also the hotkey of "${name(c.other)}", so it may run ` +
          `that instead. Change or remove one of them in Settings → Hotkeys.`,
        10000,
      );
    }
  }

  /** Sets each command in HOTKEYS to exactly its listed hotkeys (written to .obsidian/hotkeys.json). */
  private async applyHotkeys(skip: (id: string) => boolean): Promise<[string, string][]> {
    const hm = this.app.hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return [];
    const changed: [string, string][] = [];
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (skip(id)) continue;
      const now = hm.getHotkeys?.(id);
      // no entry at all means the command's default hotkeys (Templater's own, say): write the list explicitly
      if (now !== undefined && sameHotkeys(now, keys)) continue;
      hm.setHotkeys(
        id,
        keys.map(k => ({ modifiers: [...k.modifiers], key: k.key })),
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
  private setConfig(key: string, value: unknown): boolean {
    const vault = this.app.vault;
    if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return false;
    if (vault.getConfig(key) === value) return false;
    vault.setConfig(key, value);
    return true;
  }

  private async applyCorePlugins(skip: (id: string) => boolean): Promise<[string, string][]> {
    const plugins = this.app.internalPlugins?.plugins;
    if (!plugins) return [];
    const changed: [string, string][] = [];
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
  private rerenderDateFields() {
    const mtm = this.app.metadataTypeManager;
    if (!mtm || typeof mtm.trigger !== "function") return;
    const props = mtm.getAllProperties?.() ?? {};
    for (const [key, info] of Object.entries(props))
      if (info?.widget === "date" || info?.widget === "datetime") mtm.trigger("changed", key);
    // a Bases tab keeps its cells: build it again (its query, view and scroll come back from its state)
    for (const leaf of this.app.workspace.getLeavesOfType("bases")) void leaf.rebuildView?.();
  }

  /** Date / Date & time property widgets: ISO text fields (see properties.ts). Undone on unload. */
  private patchDateWidgets() {
    const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
    if (!widgets) return;
    const plugin = this;
    const types: IsoType[] = ["date", "datetime"];
    for (const type of types) {
      const w = widgets[type];
      if (typeof w?.render !== "function") continue;
      this.register(
        around(w, {
          render: next =>
            function (this: unknown, el: HTMLElement, value: unknown, ctx: unknown) {
              const widget = next.call(this, el, value, ctx);
              if (plugin.settings.isoDates) {
                try {
                  isoifyWidget(type, widget, el);
                } catch (e) {
                  console.error("[editor-defaults] could not change the date field", e);
                }
              }
              return widget;
            },
        }),
      );
    }
  }

  /**
   * What to change in a link just picked from a [[ dropdown: the note name Obsidian adds as an alias to a note
   * pick, and, for a heading or block pick (where Obsidian keeps the note name as typed), the path from the
   * vault root when new links use it.
   */
  private pickFix(raw: unknown, sourcePath: string): PickFix {
    const fix: PickFix = {};
    const item = linkSuggestion(raw);
    const file = item.file;
    if (!file) return fix;
    if (item.type === "file" && this.settings.stripAlias) fix.dropAlias = file.basename;
    if (
      (item.type === "heading" || item.type === "block") &&
      this.settings.forceRootPaths &&
      this.app.vault.getConfig?.("newLinkFormat") === "absolute"
    )
      fix.path = this.app.metadataCache.fileToLinktext(file, sourcePath, true);
    return fix;
  }

  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester in the editor (undone on unload). */
  private patchLinkSuggest() {
    const suggests = this.app.workspace.editorSuggest?.suggests ?? [];
    const plugin = this;
    for (const suggest of suggests) {
      if (typeof suggest?.selectSuggestion !== "function") continue;
      this.register(
        around(suggest, {
          selectSuggestion: next =>
            function (this: EditorSuggest<unknown>, item: unknown, evt: MouseEvent | KeyboardEvent) {
              // the context is gone once the suggestion is taken
              const editor = this.context?.editor;
              const fix = plugin.pickFix(item, this.context?.file?.path ?? "");
              const result = next.call(this, item, evt);
              if (editor && (fix.dropAlias !== undefined || fix.path !== undefined)) fixLinkAtCursor(editor, fix);
              return result;
            },
        }),
      );
    }
  }

  /**
   * The [[ suggester in property values is created per field, from a class Obsidian doesn't export. It is an
   * AbstractInputSuggest that shows its suggestions through the base class, so its prototype is patched the
   * first time one shows (undone on unload).
   */
  private patchPropertyLinkSuggest() {
    const plugin = this;
    const patched = new Set<PropertyLinkSuggestProto>();
    const patchProto = (proto: PropertyLinkSuggestProto) => {
      patched.add(proto);
      this.register(
        around(proto, {
          selectSuggestion: next =>
            function (this: PropertyLinkSuggest, item: unknown, evt: unknown) {
              const fix = plugin.pickFix(item, this.sourcePath ?? "");
              if (fix.dropAlias === undefined && fix.path === undefined) return next.call(this, item, evt);
              const apply = (text: string, ch: number) => {
                const r = fixPickedLink(text, ch, fix);
                return r ? { text: text.slice(0, r.from) + r.text + text.slice(r.to), ch: r.ch } : null;
              };
              // Enter / click: the finished text goes to onSelectLink
              const onSelect = this.onSelectLink;
              let committed = false;
              if (typeof onSelect === "function")
                this.onSelectLink = (text: string, e: unknown) => {
                  committed = true;
                  onSelect.call(this, apply(text, text.length)?.text ?? text, e);
                };
              try {
                next.call(this, item, evt);
              } finally {
                this.onSelectLink = onSelect;
              }
              // Tab, # or ^: the text is in the field, with the dropdown still open
              if (!committed) fixFieldLink(this.inputEl, apply);
            },
        }),
      );
    };
    // showSuggestions is declared in types/obsidian.d.ts (PopoverSuggest's, not in the public API)
    const base: AbstractInputSuggest<unknown> = AbstractInputSuggest.prototype;
    this.register(
      around(base, {
        showSuggestions: next =>
          function (this: AbstractInputSuggest<unknown>, values: unknown[]) {
            try {
              const proto: unknown = Object.getPrototypeOf(this);
              if (
                isPropertyLinkSuggestProto(proto) &&
                !patched.has(proto) &&
                "onSelectLink" in this &&
                typeof this.onSelectLink === "function"
              )
                patchProto(proto);
            } catch (e) {
              console.error("[editor-defaults] could not patch the property link suggester", e);
            }
            return next.call(this, values);
          },
      }),
    );
  }
}

/** Applies `fix` to the link around the cursor, keeping the cursor at the same place in it. */
function fixLinkAtCursor(editor: Editor, fix: PickFix) {
  const cursor = editor.getCursor();
  const r = fixPickedLink(editor.getLine(cursor.line), cursor.ch, fix);
  if (!r) return;
  editor.replaceRange(r.text, { line: cursor.line, ch: r.from }, { line: cursor.line, ch: r.to });
  editor.setCursor({ line: cursor.line, ch: r.ch });
}

/** The same for a property's contenteditable field (plain text), then lets Obsidian's suggester update. */
function fixFieldLink(el: HTMLElement, apply: (text: string, ch: number) => { text: string; ch: number } | null) {
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
