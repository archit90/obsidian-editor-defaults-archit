import { App, PluginSettingTab, Setting } from "obsidian";
import type EditorDefaultsPlugin from "./main";

export interface Settings {
  forceRootPaths: boolean; // set "New link format" to "Absolute path in vault"
  stripAlias: boolean; // drop the |alias the dropdown appends
  forceAttachments: boolean; // set "Default location for new attachments" to a folder
  attachmentFolder: string;
  forceTrash: boolean; // set "Deleted files" to "Move to Obsidian trash (.trash folder)"
  forceCorePlugins: boolean; // enable/disable the core plugins listed in CORE_PLUGINS
  forceHotkeys: boolean; // set the hotkeys listed in HOTKEYS
  isoDates: boolean; // Date / Date & time properties as YYYY-MM-DD text, not the locale-formatted picker
}

export const DEFAULTS: Settings = {
  forceRootPaths: true,
  stripAlias: true,
  forceAttachments: true,
  attachmentFolder: "u",
  forceTrash: true,
  forceCorePlugins: true,
  forceHotkeys: true,
  isoDates: true,
};

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export class EditorDefaultsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: EditorDefaultsPlugin,
  ) {
    super(app, plugin);
  }

  private toggle(name: string, desc: string, key: BoolKey) {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle(t =>
        t.setValue(this.plugin.settings[key]).onChange(async v => {
          this.plugin.settings[key] = v;
          await this.plugin.saveSettings();
        }),
      );
  }

  override display() {
    const { containerEl } = this;
    containerEl.empty();

    this.toggle(
      "New links use path from vault root",
      'Keeps "New link format" set to "Absolute path in vault".',
      "forceRootPaths",
    );
    this.toggle(
      "Insert [[path]] without alias",
      "Picking a note from the [[ dropdown inserts only the link target, not [[path|name]]. Works with absolute and relative link formats.",
      "stripAlias",
    );
    this.toggle(
      "Keep attachments in one folder",
      'Keeps "Default location for new attachments" set to the folder below.',
      "forceAttachments",
    );
    new Setting(containerEl)
      .setName("Attachment folder")
      .setDesc("Path from the vault root.")
      .addText(t => {
        // applied when the field loses focus: a half-typed folder must not become the attachment folder
        t.setValue(this.plugin.settings.attachmentFolder).onChange(v => {
          this.plugin.settings.attachmentFolder = v;
        });
        t.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
      });
    this.toggle(
      "Deleted files go to the Obsidian trash",
      'Keeps "Deleted files" set to "Move to Obsidian trash (.trash folder)".',
      "forceTrash",
    );
    this.toggle(
      "Enforce core plugins",
      "Keeps Bases on, and Templates, Unique note creator and Backlinks off.",
      "forceCorePlugins",
    );
    this.toggle(
      "Enforce hotkeys",
      "Navigate back: Ctrl/Cmd+Alt+← and Ctrl/Cmd+[. Navigate forward: Ctrl/Cmd+Alt+→ and Ctrl/Cmd+]. Templater, open insert template modal: Alt+N.",
      "forceHotkeys",
    );
    this.toggle(
      "Dates in properties as YYYY-MM-DD (date & time with seconds)",
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker. Reopen notes after changing this.",
      "isoDates",
    );
  }
}
