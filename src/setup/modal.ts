// The one dialog of the vault setup: plugins to install or remove (and, the first time on a device, the values
// the vault holds differently), with Apply / Update the note from this vault / Not now.
import { App, Modal, Setting } from "obsidian";

export type SetupChoice = "apply" | "adopt" | "later";

export interface SetupAsk {
  install: string[];
  uninstall: string[];
  /** Values that differ (the first run on this device only). */
  differences: string[];
  notePath: string;
  /** Offer "Update the note from this vault" (the first run on this device). */
  canAdopt: boolean;
}

const MAX_LISTED = 12;

export class SetupModal extends Modal {
  private choice: SetupChoice = "later";
  private done: ((c: SetupChoice) => void) | null = null;

  constructor(
    app: App,
    private ask: SetupAsk,
  ) {
    super(app);
  }

  /** Opens the dialog; resolves with the choice ("later" when it's closed some other way). */
  choose(): Promise<SetupChoice> {
    return new Promise(resolve => {
      this.done = resolve;
      this.open();
    });
  }

  override onOpen() {
    const { contentEl, ask } = this;
    this.setTitle("Set up this vault from its settings note");
    contentEl.createEl("p", { text: `Editor Defaults (Archit) read ${ask.notePath}.` });
    const section = (title: string, items: string[]) => {
      if (!items.length) return;
      contentEl.createEl("p", { text: title });
      const ul = contentEl.createEl("ul");
      for (const i of items.slice(0, MAX_LISTED)) ul.createEl("li", { text: i });
      if (items.length > MAX_LISTED) ul.createEl("li", { text: `and ${items.length - MAX_LISTED} more` });
    };
    section("Plugins to install (from their GitHub releases):", ask.install);
    section("Plugins to remove:", ask.uninstall);
    section("Settings this vault holds differently from the note:", ask.differences);
    const buttons = new Setting(contentEl);
    buttons.addButton(b =>
      b
        .setButtonText(ask.install.length || ask.uninstall.length ? "Apply and install" : "Apply the note")
        .setCta()
        .onClick(() => this.pick("apply")),
    );
    if (ask.canAdopt)
      buttons.addButton(b => b.setButtonText("Update the note from this vault").onClick(() => this.pick("adopt")));
    buttons.addButton(b => b.setButtonText("Not now").onClick(() => this.pick("later")));
  }

  private pick(c: SetupChoice) {
    this.choice = c;
    this.close();
  }

  override onClose() {
    this.contentEl.empty();
    this.done?.(this.choice);
    this.done = null;
  }
}
