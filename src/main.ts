import { Editor, EditorSuggest, Plugin } from "obsidian";
import { around } from "monkey-around";
import { CORE_PLUGINS, HOTKEYS, sameHotkeys } from "./defaults";
import { trailingAliasFix } from "./links";
import { IsoType, isoifyWidget } from "./properties";
import { DEFAULTS, EditorDefaultsTab, Settings } from "./settings";

/** What the [[ link suggester passes to selectSuggestion (only the fields used here). */
interface LinkSuggestion {
  file?: { basename?: string };
  type?: string;
}
type LinkSuggest = EditorSuggest<LinkSuggestion> & { __editorDefaultsPatched?: boolean };

export default class EditorDefaultsPlugin extends Plugin {
  override settings: Settings = { ...DEFAULTS };

  override async onload() {
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
    // "Absolute path in vault" == path from root.
    if (s.forceRootPaths) this.setConfig("newLinkFormat", "absolute");
    if (s.forceAttachments && s.attachmentFolder.trim()) {
      this.setConfig("attachmentFolderPath", s.attachmentFolder.trim());
    }
    // "local" == Obsidian trash (.trash), "system" == OS trash, "none" == delete permanently
    if (s.forceTrash) this.setConfig("trashOption", "local");
    if (s.forceCorePlugins) await this.applyCorePlugins();
    if (s.forceHotkeys) await this.applyHotkeys();
  }

  /** Sets each command in HOTKEYS to exactly its listed hotkeys (written to .obsidian/hotkeys.json). */
  private async applyHotkeys() {
    const hm = this.app.hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return;
    let changed = false;
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (sameHotkeys(hm.getHotkeys?.(id), keys)) continue;
      hm.setHotkeys(
        id,
        keys.map(k => ({ modifiers: [...k.modifiers], key: k.key })),
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

  private setConfig(key: string, value: unknown) {
    const vault = this.app.vault;
    if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return;
    if (vault.getConfig(key) !== value) vault.setConfig(key, value);
  }

  private async applyCorePlugins() {
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
  private patchDateWidgets() {
    const widgets = this.app.metadataTypeManager?.registeredTypeWidgets;
    if (!widgets) return;
    const plugin = this;
    for (const type of ["date", "datetime"] as IsoType[]) {
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

  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester (undone on unload). */
  private patchLinkSuggest() {
    const suggests = (this.app.workspace.editorSuggest?.suggests ?? []) as LinkSuggest[];
    const plugin = this;
    for (const suggest of suggests) {
      if (typeof suggest?.selectSuggestion !== "function" || suggest.__editorDefaultsPatched) continue;
      suggest.__editorDefaultsPatched = true;
      this.register(() => delete suggest.__editorDefaultsPatched);
      this.register(
        around(suggest, {
          selectSuggestion: next =>
            function (this: LinkSuggest, item: LinkSuggestion, evt: MouseEvent | KeyboardEvent) {
              const editor = this.context?.editor;
              // Obsidian only adds an alias itself to a note pick ("file"), and then it's the note's name. An
              // alias already in the link (`[[old|my words]]`, retargeted) is kept by Obsidian: keep it too.
              const name = item?.type === "file" ? item.file?.basename : undefined;
              const result = next.call(this, item, evt);
              if (editor && name && plugin.settings.stripAlias) stripAliasBeforeCursor(editor, name);
              return result;
            },
        }),
      );
    }
  }
}

function stripAliasBeforeCursor(editor: Editor, name: string) {
  const cursor = editor.getCursor();
  const fix = trailingAliasFix(editor.getLine(cursor.line).slice(0, cursor.ch), name);
  if (!fix) return;
  editor.replaceRange(fix.text, { line: cursor.line, ch: fix.from }, cursor);
  editor.setCursor({ line: cursor.line, ch: fix.from + fix.text.length });
}
