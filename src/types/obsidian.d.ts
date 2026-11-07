// Obsidian internals this plugin relies on (not in the public API). Checked against Obsidian 1.15.0.
import "obsidian";

declare module "obsidian" {
  interface App {
    hotkeyManager?: {
      getHotkeys?(commandId: string): Hotkey[] | undefined;
      /** The hotkeys a command registered (used when it has no entry of its own). */
      getDefaultHotkeys?(commandId: string): Hotkey[] | undefined;
      setHotkeys(commandId: string, keys: Hotkey[]): void;
      /** Writes hotkeys.json (the Hotkeys tab calls it after each change). */
      save(): Promise<void>;
    };
    internalPlugins?: {
      plugins: Record<
        string,
        {
          enabled: boolean;
          instance?: { id: string; name?: string };
          enable?(save: boolean): Promise<void>;
          disable?(save: boolean): Promise<void>;
        }
      >;
      /** "change" fires after a core plugin is turned on or off. */
      on?(name: "change", callback: (plugin: unknown) => unknown): EventRef;
    };
    commands?: {
      /** Every registered command, by id. */
      commands?: Record<string, { id: string; name: string }>;
      /** Editor commands (in `commands` only while an editor has focus). */
      editorCommands?: Record<string, { id: string; name: string }>;
      findCommand?(id: string): { name: string } | undefined;
    };
    /** The Settings modal. */
    setting?: {
      isOpen?: boolean;
      activeTab?: {
        id?: string;
        containerEl?: HTMLElement;
        display?(): void;
        /** The Hotkeys tab: recomputes conflicts and redraws the list, keeping the filter. */
        onHotkeysChanged?(): void;
      } | null;
    };
  }
  interface App {
    /** Property types and their widgets (Properties core plugin). */
    metadataTypeManager?: {
      registeredTypeWidgets: Record<
        string,
        { render(el: HTMLElement, value: unknown, ctx: unknown): { inputEl?: HTMLInputElement } | undefined }
      >;
      /** Lower-cased property name -> its name and widget type ("date", "datetime", "text"…). */
      getAllProperties?(): Record<string, { name: string; widget?: string }>;
      /** "changed" with a lower-cased property name redraws that property in every open note and Base. */
      trigger?(name: "changed", key: string): void;
    };
  }
  interface Vault {
    getConfig?(key: string): unknown;
    setConfig?(key: string, value: unknown): void;
    /** Fires with the key after setConfig, and when app.json changes on disk. */
    on(name: "config-changed", callback: (key: string) => unknown, ctx?: unknown): EventRef;
    /** Fires with the vault-relative path of any file changed on disk, the config folder included. */
    on(name: "raw", callback: (path: string) => unknown, ctx?: unknown): EventRef;
  }
  interface AbstractInputSuggest<T> {
    /** Shows the dropdown with these items (PopoverSuggest's; every subclass shows its items through it). */
    showSuggestions(values: T[]): void;
  }
  interface WorkspaceLeaf {
    /** Closes and reopens the leaf's view with the same state. */
    rebuildView?(): Promise<void>;
  }
  interface Workspace {
    /** Editor suggesters, including the built-in [[ link suggester. */
    editorSuggest?: { suggests: EditorSuggest<unknown>[] };
  }
}
