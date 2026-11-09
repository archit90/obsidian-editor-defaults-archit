import { App, PluginSettingTab, Setting } from "obsidian";
import type EditorDefaultsPlugin from "./main";

export interface Settings {
  forceRootPaths: boolean; // heading and block links picked from [[ get the path from the vault root
  stripAlias: boolean; // drop the |alias the dropdown appends
  isoDates: boolean; // Date / Date & time properties as YYYY-MM-DD text, not the locale-formatted picker
  setupEnabled: boolean; // apply the settings note to the vault and take Settings changes into it
  setupNote: string; // the settings note's path
}

export const DEFAULT_NOTE = "Vault settings.md";
/** An earlier build's default, in a system folder: a data.json that saved it moves to the vault root with the default. */
const OLD_DEFAULT_NOTE = "_s/Vault settings.md";

export const DEFAULTS: Settings = {
  forceRootPaths: true,
  stripAlias: true,
  isoDates: true,
  setupEnabled: true,
  setupNote: DEFAULT_NOTE,
};

/** Each setting's name in the settings tab. */
export const SETTING_NAMES: Record<keyof Settings, string> = {
  forceRootPaths: "Heading and block links use the path from the vault root",
  stripAlias: "Insert [[path]] without alias",
  isoDates: "Dates in properties as YYYY-MM-DD (date & time with seconds)",
  setupEnabled: "Set up the vault from the settings note",
  setupNote: "Settings note",
};

export type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const BOOL_KEYS: BoolKey[] = ["forceRootPaths", "stripAlias", "isoDates", "setupEnabled"];

/** The saved settings (data.json) over the defaults: unknown keys (an older version's too) and wrong types are ignored. */
export function parseSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULTS };
  if (typeof raw !== "object" || raw === null) return out;
  const get = (key: keyof Settings): unknown => (Object.hasOwn(raw, key) ? Reflect.get(raw, key) : undefined);
  for (const key of BOOL_KEYS) {
    const v = get(key);
    if (typeof v === "boolean") out[key] = v;
  }
  const note = get("setupNote");
  if (typeof note === "string" && note.trim().endsWith(".md") && note.trim() !== OLD_DEFAULT_NOTE)
    out.setupNote = note.trim();
  return out;
}

const logError = (e: unknown) => console.error("[editor-defaults] could not save the settings", e);

export class EditorDefaultsTab extends PluginSettingTab {
  /** The note path as typed: applied when the field loses focus or the tab closes, never half-typed. */
  private noteDraft: string | null = null;

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

  private commitNote() {
    const draft = this.noteDraft?.trim();
    this.noteDraft = null;
    if (!draft || draft === this.plugin.settings.setupNote || !draft.endsWith(".md")) return;
    this.plugin.settings.setupNote = draft;
    this.plugin.saveSettings().catch(logError);
  }

  override hide() {
    this.commitNote();
    super.hide();
  }

  override display() {
    const { containerEl } = this;
    containerEl.empty();
    this.toggle(
      "Picking a note from the [[ dropdown inserts only the link target, not [[path|name]]. Works with absolute and relative link formats, in notes and in properties.",
      "stripAlias",
    );
    this.toggle(
      'While "New link format" is "Absolute path in vault", heading and block links picked from the [[ dropdown get the full path too.',
      "forceRootPaths",
    );
    this.toggle(
      "Date and Date & time properties show and take YYYY-MM-DD (date & time: YYYY-MM-DD HH:mm:ss) instead of your system's date format; the calendar button still opens a date picker.",
      "isoDates",
    );

    new Setting(containerEl).setName("Vault setup").setHeading();
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text:
        "The settings note lists this vault's plugins (where they come from, whether they're on) and the settings " +
        "that differ from the defaults: Obsidian's, the core plugins', the hotkeys, the property types and each " +
        "plugin's. Editor Defaults (Archit) applies it at start and whenever it changes. A change you make in " +
        "Settings is written into the note; a change made any other way (a synced file, another plugin) is put " +
        "back. Installing or removing a plugin always asks first.",
    });
    this.toggle("Apply the settings note and keep it up to date.", "setupEnabled");
    new Setting(containerEl)
      .setName(SETTING_NAMES.setupNote)
      .setDesc("Path from the vault root. Applied when you leave the field.")
      .addText(t => {
        t.setValue(this.noteDraft ?? this.plugin.settings.setupNote).onChange(v => {
          this.noteDraft = v;
        });
        t.inputEl.addEventListener("blur", () => this.commitNote());
      });
    const st = this.plugin.setup.status;
    const status = new Setting(containerEl).setName("Status");
    const lines: string[] = [];
    if (st.note === "off") lines.push("Off.");
    else if (st.note === "missing") lines.push(`There is no note at ${this.plugin.settings.setupNote}.`);
    else {
      const d = st.differences;
      lines.push(
        d.length
          ? `The vault differs from the note in ${d.length}: ${d.slice(0, 5).join("; ")}${d.length > 5 ? "…" : ""}`
          : "The vault matches the note.",
      );
      if (st.install.length) lines.push(`To install: ${st.install.join(", ")}.`);
      if (st.uninstall.length) lines.push(`To remove: ${st.uninstall.join(", ")}.`);
      for (const e of st.errors) lines.push(`Block at line ${e.at.line} isn't used: ${e.message}`);
    }
    status.setDesc(lines.join("\n"));
    status.descEl.addClass("editor-defaults-status");
    if (st.note === "missing")
      status.addButton(b =>
        b
          .setButtonText("Create from the default")
          .setCta()
          .onClick(() => void this.plugin.setup.run(true).then(() => this.display())),
      );
    else if (st.note === "ok") {
      status.addButton(b =>
        b.setButtonText("Apply now").onClick(() => void this.plugin.setup.run(true).then(() => this.display())),
      );
      status.addButton(b => b.setButtonText("Open the note").onClick(() => void this.plugin.openSetupNote()));
    }
  }
}
