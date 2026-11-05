import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

interface Settings {
  forceRootPaths: boolean; // set "New link format" to "Absolute path in vault"
  stripAlias: boolean; // drop the |alias the dropdown appends
  forceAttachments: boolean; // set "Default location for new attachments" to a folder
  attachmentFolder: string;
  forceTrash: boolean; // set "Deleted files" to "Move to Obsidian trash (.trash folder)"
  forceCorePlugins: boolean; // enable/disable the core plugins listed in CORE_PLUGINS
  forceHotkeys: boolean; // set the hotkeys listed in HOTKEYS
}
const DEFAULTS: Settings = {
  forceRootPaths: true,
  stripAlias: true,
  forceAttachments: true,
  attachmentFolder: "u",
  forceTrash: true,
  forceCorePlugins: true,
  forceHotkeys: true,
};

// core plugin id -> wanted state
const CORE_PLUGINS: Record<string, boolean> = {
  bases: true,
  templates: false, // Templater replaces it
  "zk-prefixer": false, // "Unique note creator"
  backlink: false, // Backlinks Full View's "All backlinks" pane replaces it
};

// command id -> hotkeys it should have (replaces Obsidian's defaults for that command, so defaults are listed too)
interface Hotkey { modifiers: string[]; key: string }
const HOTKEYS: Record<string, Hotkey[]> = {
  "app:go-back": [
    { modifiers: ["Mod", "Alt"], key: "ArrowLeft" }, // Obsidian's default
    { modifiers: ["Mod"], key: "[" },
  ],
  "app:go-forward": [
    { modifiers: ["Mod", "Alt"], key: "ArrowRight" }, // Obsidian's default
    { modifiers: ["Mod"], key: "]" },
  ],
};

// [[target|alias]] sitting right before the cursor
const TRAILING_LINK = /\[\[([^\[\]|]+)\|([^\[\]]*)\]\]$/;

type AnyFn = (...args: any[]) => any;

export default class EditorDefaultsPlugin extends Plugin {
  settings: Settings = DEFAULTS;
  private restore: Array<() => void> = [];

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
    const hm = (this.app as any).hotkeyManager;
    if (!hm || typeof hm.setHotkeys !== "function") return;
    const norm = (ks: Hotkey[] | undefined) =>
      JSON.stringify((ks ?? []).map((k) => ({ modifiers: [...k.modifiers].sort(), key: k.key.toLowerCase() })));
    let changed = false;
    for (const [id, keys] of Object.entries(HOTKEYS)) {
      if (norm(hm.getHotkeys?.(id)) === norm(keys)) continue; // custom keys only (defaults aren't included)
      hm.setHotkeys(id, keys.map((k) => ({ modifiers: [...k.modifiers], key: k.key })));
      changed = true;
    }
    if (changed) {
      try { await hm.save?.(); } catch (e) { console.error("[editor-defaults] could not save hotkeys", e); }
    }
  }

  private setConfig(key: string, value: unknown) {
    const vault = this.app.vault as any;
    if (typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return;
    if (vault.getConfig(key) !== value) vault.setConfig(key, value);
  }

  private async applyCorePlugins() {
    const plugins = (this.app as any).internalPlugins?.plugins;
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

  /** Wrap selectSuggestion on Obsidian's built-in [[ link suggester. */
  private patchLinkSuggest() {
    const suggests: any[] = (this.app.workspace as any).editorSuggest?.suggests ?? [];
    for (const suggest of suggests) {
      if (typeof suggest?.selectSuggestion !== "function") continue;
      if (suggest.__editorDefaultsPatched) continue;
      const original: AnyFn = suggest.selectSuggestion;
      const plugin = this;
      suggest.__editorDefaultsPatched = true;
      suggest.selectSuggestion = function (this: any, item: any, evt: any) {
        const editor = this.context?.editor;
        const isFileLink =
          item && item.file && ["file", "heading", "block", "linktext"].includes(item.type);
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

  private stripAliasBeforeCursor(editor: any) {
    const cursor = editor.getCursor();
    const before: string = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = TRAILING_LINK.exec(before);
    if (!m) return;
    const from = { line: cursor.line, ch: m.index };
    editor.replaceRange(`[[${m[1]}]]`, from, cursor);
    editor.setCursor({ line: cursor.line, ch: m.index + m[1].length + 4 });
  }
}

class EditorDefaultsTab extends PluginSettingTab {
  constructor(app: App, private plugin: EditorDefaultsPlugin) {
    super(app, plugin);
  }

  private toggle(name: string, desc: string, key: keyof Settings) {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) =>
        t.setValue(this.plugin.settings[key] as boolean).onChange(async (v) => {
          (this.plugin.settings as any)[key] = v;
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
    new Setting(containerEl)
      .setName("Attachment folder")
      .setDesc("Path from the vault root.")
      .addText((t) =>
        t.setValue(this.plugin.settings.attachmentFolder).onChange(async (v) => {
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
      "Navigate back: Ctrl/Cmd+Alt+← and Ctrl/Cmd+[. Navigate forward: Ctrl/Cmd+Alt+→ and Ctrl/Cmd+].",
      "forceHotkeys"
    );
  }
}
