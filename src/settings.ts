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

/** Each setting's name in the settings tab (also used in the notice when a default is put back). */
export const SETTING_NAMES: Record<keyof Settings, string> = {
  forceRootPaths: "New links use path from vault root",
  stripAlias: "Insert [[path]] without alias",
  forceAttachments: "Keep attachments in one folder",
  attachmentFolder: "Attachment folder",
  forceTrash: "Deleted files go to the Obsidian trash",
  forceCorePlugins: "Enforce core plugins",
  forceHotkeys: "Enforce hotkeys",
  isoDates: "Dates in properties as YYYY-MM-DD (date & time with seconds)",
};

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

/** The on/off settings. */
const BOOL_KEYS: BoolKey[] = [
  "forceRootPaths",
  "stripAlias",
  "forceAttachments",
  "forceTrash",
  "forceCorePlugins",
  "forceHotkeys",
  "isoDates",
];

/** The saved settings (data.json) over the defaults: unknown keys and values of the wrong type are ignored. */
export function parseSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULTS };
  if (typeof raw !== "object" || raw === null) return out;
  const get = (key: keyof Settings): unknown => (Object.hasOwn(raw, key) ? Reflect.get(raw, key) : undefined);
  for (const key of BOOL_KEYS) {
    const v = get(key);
    if (typeof v === "boolean") out[key] = v;
  }
  const folder = get("attachmentFolder");
  if (typeof folder === "string") out.attachmentFolder = folder;
  return out;
}

export class EditorDefaultsTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: EditorDefaultsPlugin,
  ) {
    super(app, plugin);
  }

  private toggle(desc: string, key: BoolKey) {
    new Setting(this.containerEl)
      .setName(SETTING_NAMES[key])
      .setDesc(desc)
      .addToggle(t =>
        t.setValue(this.plugin.settings[key]).onChange(async v => {
          this.plugin.settings[key] = v;
          if (key === "isoDates") await this.plugin.isoDatesChanged();
          else await this.plugin.saveSettings();
        }),
      );
  }

  override display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "While one of these is on, Editor Defaults puts its value back whenever it changes: in Obsidian's settings, from another device, or by another plugin. Turn it off here to change that value yourself.",
    });

    this.toggle(
      'Keeps "New link format" set to "Absolute path in vault". Heading and block links picked from the [[ dropdown get the full path too.',
      "forceRootPaths",
    );
    this.toggle(
      "Picking a note from the [[ dropdown inserts only the link target, not [[path|name]]. Works with absolute and relative link formats, in notes and in properties.",
      "stripAlias",
    );
    this.toggle('Keeps "Default location for new attachments" set to the folder below.', "forceAttachments");
    new Setting(containerEl)
      .setName(SETTING_NAMES.attachmentFolder)
      .setDesc("Path from the vault root.")
      .addText(t => {
        // applied when the field loses focus: a half-typed folder must not become the attachment folder
        t.setValue(this.plugin.settings.attachmentFolder).onChange(v => {
          this.plugin.settings.attachmentFolder = v;
        });
        t.inputEl.addEventListener("blur", () => void this.plugin.saveSettings());
      });
    this.toggle('Keeps "Deleted files" set to "Move to Obsidian trash (.trash folder)".', "forceTrash");
    this.toggle("Keeps Bases on, and Templates, Unique note creator and Backlinks off.", "forceCorePlugins");
    this.toggle(
      "Navigate back: Ctrl/Cmd+Alt+← and Ctrl/Cmd+[. Navigate forward: Ctrl/Cmd+Alt+→ and Ctrl/Cmd+]. Templater, create new note from template: Alt+N (and no hotkey on its insert template modal).",
      "forceHotkeys",
    );
    this.toggle(
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker.",
      "isoDates",
    );
  }
}
