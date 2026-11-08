import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import { corePluginsDescription, ENFORCED, hotkeysDescription } from "./defaults";
import type EditorDefaultsPlugin from "./main";

export interface Settings {
  forceRootPaths: boolean; // set "New link format" to "Absolute path in vault"
  stripAlias: boolean; // drop the |alias the dropdown appends
  forceAttachments: boolean; // set "Default location for new attachments" to a folder
  attachmentFolder: string;
  forceTrash: boolean; // set "Deleted files" to "Move to Obsidian trash (.trash folder)"
  forceCorePlugins: boolean; // enable/disable the core plugins in defaults.json
  forceHotkeys: boolean; // set the hotkeys in defaults.json
  isoDates: boolean; // Date / Date & time properties as YYYY-MM-DD text, not the locale-formatted picker
}

export const DEFAULTS: Settings = {
  forceRootPaths: true,
  stripAlias: true,
  forceAttachments: true,
  attachmentFolder: ENFORCED.attachmentFolder,
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

export type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

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

const logError = (e: unknown) => console.error("[editor-defaults] could not save the settings", e);

export class EditorDefaultsTab extends PluginSettingTab {
  /** The attachment folder as typed: applied when the field loses focus or the tab closes, never half-typed. */
  private folderDraft: string | null = null;

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
        t.setValue(this.plugin.settings[key]).onChange(v => {
          this.plugin.settings[key] = v;
          const saved = key === "isoDates" ? this.plugin.isoDatesChanged() : this.plugin.saveSettings();
          saved.catch(logError);
        }),
      );
  }

  /** Applies the attachment folder being typed, trimmed, if it changed. */
  private commitFolder() {
    const draft = this.folderDraft?.trim();
    this.folderDraft = null;
    if (draft === undefined || draft === this.plugin.settings.attachmentFolder) return;
    this.plugin.settings.attachmentFolder = draft;
    this.plugin.saveSettings().catch(logError);
  }

  override hide() {
    this.commitFolder();
    super.hide();
  }

  override display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "While one of these is on, Editor Defaults (Archit) puts its value back whenever it changes: in Obsidian's settings, from another device, or by another plugin. Turn it off here to change that value yourself.",
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
      .setDesc("Path from the vault root. Applied when you leave the field.")
      .addText(t => {
        t.setValue(this.folderDraft ?? this.plugin.settings.attachmentFolder).onChange(v => {
          this.folderDraft = v;
        });
        t.inputEl.addEventListener("blur", () => this.commitFolder());
      });
    this.toggle('Keeps "Deleted files" set to "Move to Obsidian trash (.trash folder)".', "forceTrash");
    this.toggle(corePluginsDescription(), "forceCorePlugins");
    this.toggle(
      `${hotkeysDescription(Platform.isMacOS || Platform.isIosApp)} A hotkey for a plugin that isn't installed is saved and works once it is.`,
      "forceHotkeys",
    );
    this.toggle(
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker.",
      "isoDates",
    );
  }
}
