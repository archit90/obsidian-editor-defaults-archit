import { Editor, EditorSuggest, Plugin } from "obsidian";
import { around } from "monkey-around";
import { CORE_PLUGINS, HOTKEYS, sameHotkeys } from "./defaults";
import { trailingAliasFix } from "./links";
import { DEFAULTS, EditorDefaultsTab, Settings } from "./settings";

/** What the [[ link suggester passes to selectSuggestion (only the fields used here). */
interface LinkSuggestion {
  file?: unknown;
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
              const isFileLink = !!item?.file && ["file", "heading", "block", "linktext"].includes(item.type ?? "");
              const result = next.call(this, item, evt);
              if (editor && isFileLink && plugin.settings.stripAlias) stripAliasBeforeCursor(editor);
              return result;
            },
        }),
      );
    }
  }
}

function stripAliasBeforeCursor(editor: Editor) {
  const cursor = editor.getCursor();
  const fix = trailingAliasFix(editor.getLine(cursor.line).slice(0, cursor.ch));
  if (!fix) return;
  editor.replaceRange(fix.text, { line: cursor.line, ch: fix.from }, cursor);
  editor.setCursor({ line: cursor.line, ch: fix.from + fix.text.length });
}
