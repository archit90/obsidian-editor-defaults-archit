import { AbstractInputSuggest, Editor, EditorSuggest, Hotkey, Notice, Platform, Plugin, TFile } from "obsidian";
import { around } from "monkey-around";
import { hotkeyClashes } from "./defaults";
import { parseHotkey } from "./setup/hotkeys";
import type { JsonObject } from "./setup/json";
import { VaultSetup } from "./setup/setup";
import { fixPickedLink, isLinkTrigger, PickFix } from "./links";
import { IsoType, isoifyWidget } from "./properties";
import { DEFAULTS, EditorDefaultsTab, parseSettings, Settings } from "./settings";

const logError = (what: string) => (e: unknown) => console.error(`[editor-defaults] ${what}`, e);

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
 * Obsidian's own [[ link suggester among the editor suggesters: the one with a suggestManager that finds notes,
 * headings and blocks. Other suggesters (tags, slash commands, every plugin's) are left alone.
 */
function isCoreLinkSuggest(s: unknown): boolean {
  if (typeof s !== "object" || s === null || !("suggestManager" in s)) return false;
  const m = s.suggestManager;
  return typeof m === "object" && m !== null && "getFileSuggestions" in m && typeof m.getFileSuggestions === "function";
}

/**
 * Obsidian's [[ suggester in property values (an AbstractInputSuggest whose class Obsidian doesn't export): Enter
 * or a click hands the finished text to onSelectLink; Tab, `#` and `^` put it in the field and keep the dropdown open.
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

export default class EditorDefaultsPlugin extends Plugin {
  override settings: Settings = { ...DEFAULTS };
  /** Set on unload: whatever is still running (the layout-ready callback) stops there. */
  private unloaded = false;
  /** Hotkey clashes already warned about this session ("other command|hotkey"). */
  private warnedClashes = new Set<string>();
  setup!: VaultSetup;
  /** The settings note and on/off the setup last ran with: a change of either runs it again. */
  private setupKey = "";

  override async onload() {
    // enabled while Obsidian runs: the open notes and Bases tabs already show Obsidian's own date fields
    const midSession = this.app.workspace.layoutReady;
    this.settings = parseSettings(await this.loadData());
    // at start, Obsidian loads plugins before it draws the workspace: every date field gets the patched widget
    this.patchDateWidgets();
    this.addSettingTab(new EditorDefaultsTab(this.app, this));
    this.setup = new VaultSetup({
      app: this.app,
      manifest: this.manifest,
      notePath: () => this.settings.setupNote,
      enabled: () => this.settings.setupEnabled,
      ownDefaults: () => ({ ...DEFAULTS }),
      applyOwnSettings: all => this.applyOwnSettings(all),
      commandName: id => this.commandName(id),
      register: cb => this.register(cb),
      registerEvent: ref => this.registerEvent(ref),
      checked: key => {
        if (key === "hotkeys") this.warnHotkeyClashes();
      },
    });
    this.setupKey = this.currentSetupKey();
    this.addCommands();
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      this.setup
        .start()
        .then(() => this.warnHotkeyClashes())
        .catch(logError("could not set up the vault"));
      this.patchLinkSuggest();
      this.patchPropertyLinkSuggest();
      if (midSession && this.settings.isoDates) this.rerenderDateFields();
    });
  }

  override onunload() {
    this.unloaded = true;
    this.setup?.stop();
    // the date widgets are unpatched by now: open notes get Obsidian's own date fields back
    if (this.settings.isoDates) this.rerenderDateFields();
  }

  /** data.json changed on disk (this plugin's settings from another device, through sync): use them at once. */
  override async onExternalSettingsChange() {
    if (this.unloaded) return;
    const before = this.settings;
    this.settings = parseSettings(await this.loadData());
    if (before.isoDates !== this.settings.isoDates) this.rerenderDateFields();
    await this.runSetupIfMoved();
  }

  async saveSettings() {
    await this.saveData(this.settings);
    await this.runSetupIfMoved();
  }

  private currentSetupKey() {
    return `${this.settings.setupEnabled}|${this.settings.setupNote}`;
  }

  /** The settings note's path or the setup's on/off changed since it last ran: run it with them. */
  private async runSetupIfMoved() {
    const key = this.currentSetupKey();
    if (key === this.setupKey) return;
    this.setupKey = key;
    this.setup.forgetNote();
    await this.setup.run();
  }

  /** The "Dates in properties" setting changed: redraw the date fields of open notes and Bases. */
  async isoDatesChanged() {
    await this.saveSettings();
    this.rerenderDateFields();
  }

  /** The settings note's block for this plugin: its settings, as data.json holds them. */
  private async applyOwnSettings(all: JsonObject) {
    // which note to read, and whether to, stay this device's (OWN_LOCAL)
    const next = {
      ...parseSettings(all),
      setupNote: this.settings.setupNote,
      setupEnabled: this.settings.setupEnabled,
    };
    const before = this.settings;
    this.settings = next;
    await this.saveData(next);
    if (before.isoDates !== next.isoDates) this.rerenderDateFields();
  }

  async createSetupNote() {
    const f = await this.setup.createNote();
    if (f) await this.app.workspace.getLeaf(true).openFile(f);
  }

  async openSetupNote() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.setupNote);
    if (f instanceof TFile) await this.app.workspace.getLeaf(true).openFile(f);
    else new Notice(`Editor Defaults (Archit): there is no note at ${this.settings.setupNote}.`);
  }

  private addCommands() {
    this.addCommand({
      id: "apply-settings-note",
      name: "Apply the settings note now",
      callback: () => void this.setup.run(true).then(() => this.warnHotkeyClashes()),
    });
    this.addCommand({
      id: "show-differences",
      name: "Show what differs from the settings note",
      callback: () =>
        void this.setup.plan().then(p => {
          const lines = [
            ...p.install.map(b => `install ${b.id}`),
            ...p.uninstall.map(b => `remove ${b.id}`),
            ...p.differences,
          ];
          new Notice(
            lines.length
              ? `Editor Defaults (Archit): the vault differs from the settings note in:\n${lines.join("\n")}`
              : "Editor Defaults (Archit): the vault matches the settings note.",
            lines.length ? 15000 : 4000,
          );
        }),
    });
    this.addCommand({
      id: "create-settings-note",
      name: "Create the settings note from this vault",
      callback: () => void this.createSetupNote(),
    });
    this.addCommand({
      id: "update-settings-note",
      name: "Update the settings note from this vault",
      callback: () =>
        void this.setup
          .updateNoteFromVault()
          .then(() => new Notice("Editor Defaults (Archit) updated the settings note.")),
    });
    this.addCommand({
      id: "open-settings-note",
      name: "Open the settings note",
      callback: () => void this.openSetupNote(),
    });
  }

  /** A command's name, or its id while its plugin isn't loaded. */
  private commandName(id: string): string {
    return this.app.commands?.findCommand?.(id)?.name ?? id;
  }

  /**
   * Warns (once per clash per session) when another command has one of the hotkeys the settings note sets: Obsidian
   * runs only one of them. The other command's hotkey is left alone. A hotkey whose command doesn't exist (its
   * plugin isn't installed) clashes with nothing.
   */
  private warnHotkeyClashes() {
    const hm = this.app.hotkeyManager;
    if (this.unloaded || !hm) return;
    const wanted: Record<string, Hotkey[]> = {};
    for (const [id, keys] of Object.entries(this.setup.noteHotkeys()))
      wanted[id] = keys.flatMap(k => {
        const h = parseHotkey(k);
        return h ? [h] : [];
      });
    // editor commands are only in `commands` while an editor has focus; `editorCommands` always has them
    const commands = { ...this.app.commands?.editorCommands, ...this.app.commands?.commands };
    const effective: Record<string, Hotkey[]> = {};
    for (const id of Object.keys(commands)) effective[id] = hm.getHotkeys?.(id) ?? hm.getDefaultHotkeys?.(id) ?? [];
    for (const c of hotkeyClashes(wanted, effective, Platform.isMacOS || Platform.isIosApp)) {
      const key = `${c.other}|${c.label}`;
      if (this.warnedClashes.has(key)) continue;
      this.warnedClashes.add(key);
      const name = (id: string) => this.app.commands?.findCommand?.(id)?.name ?? commands[id]?.name ?? id;
      new Notice(
        `Editor Defaults (Archit): ${c.label} (${name(c.command)}) is also the hotkey of "${name(c.other)}", so it may run ` +
          `that instead. Change or remove one of them in Settings → Hotkeys.`,
        10000,
      );
    }
  }

  /**
   * Redraws every Date / Date & time property field (notes in tabs, cards and canvases, the File properties view,
   * Bases tabs), so turning "Dates in properties" on or off, or the plugin, shows at once. Obsidian redraws a
   * property everywhere when its type changes ("changed" on the metadata type manager); nothing is saved.
   */
  private rerenderDateFields() {
    const mtm = this.app.metadataTypeManager;
    if (!mtm || typeof mtm.trigger !== "function") return;
    const props = mtm.getAllProperties?.() ?? {};
    for (const [key, info] of Object.entries(props))
      if (info?.widget === "date" || info?.widget === "datetime") mtm.trigger("changed", key);
    // a Bases tab keeps its cells: build it again (its query, view and scroll come back from its state)
    for (const leaf of this.app.workspace.getLeavesOfType("bases"))
      leaf.rebuildView?.()?.catch(logError("could not redraw a Bases tab"));
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
            function (this: unknown, el: HTMLElement, ...rest: unknown[]) {
              const widget: unknown = next ? Reflect.apply(next, this, [el, ...rest]) : undefined;
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

  /** Wraps selectSuggestion on Obsidian's own [[ link suggester in the editor (undone on unload). */
  private patchLinkSuggest() {
    const suggest = (this.app.workspace.editorSuggest?.suggests ?? []).find(isCoreLinkSuggest);
    if (!suggest) {
      console.warn("[editor-defaults] Obsidian's [[ link suggester wasn't found: picked links keep their alias");
      return;
    }
    const plugin = this;
    this.register(
      around(suggest, {
        selectSuggestion: next =>
          function (this: EditorSuggest<unknown>, item: unknown, ...rest: unknown[]) {
            // the context is gone once the suggestion is taken
            const ctx = this.context;
            const editor = ctx?.editor;
            // only a pick opened by [[ or ![[ (the query starts right after it)
            const before =
              ctx && editor
                ? editor.getRange({ line: ctx.start.line, ch: Math.max(0, ctx.start.ch - 2) }, ctx.start)
                : "";
            const fix = isLinkTrigger(before) ? plugin.pickFix(item, ctx?.file?.path ?? "") : {};
            const result: unknown = Reflect.apply(next, this, [item, ...rest]);
            if (editor && (fix.dropAlias !== undefined || fix.path !== undefined)) fixLinkAtCursor(editor, fix);
            return result;
          },
      }),
    );
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
            function (this: PropertyLinkSuggest, item: unknown, ...rest: unknown[]) {
              const fix = plugin.pickFix(item, this.sourcePath ?? "");
              if (fix.dropAlias === undefined && fix.path === undefined) {
                Reflect.apply(next, this, [item, ...rest]);
                return;
              }
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
                Reflect.apply(next, this, [item, ...rest]);
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
          function (this: AbstractInputSuggest<unknown>, ...args: unknown[]) {
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
            Reflect.apply(next, this, args);
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
