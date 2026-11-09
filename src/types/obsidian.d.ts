// Obsidian internals this plugin relies on (not in the public API). Checked against Obsidian 1.15.0. Every member is
// optional or checked before use, so a changed internal turns a feature off instead of throwing.
import "obsidian";

declare module "obsidian" {
  interface App {
    hotkeyManager?: {
      getHotkeys?(commandId: string): Hotkey[] | undefined;
      /** The hotkeys a command registered (used when it has no entry of its own). */
      getDefaultHotkeys?(commandId: string): Hotkey[] | undefined;
      setHotkeys?(commandId: string, keys: Hotkey[]): void;
      /** The hotkeys set in hotkeys.json, by command id (a copy). */
      customKeys?: Record<string, Hotkey[]>;
      /** Writes hotkeys.json (the Hotkeys tab calls it after each change). */
      save?(): Promise<void>;
    };
    internalPlugins?: {
      plugins: Record<
        string,
        {
          enabled: boolean;
          instance?: {
            id: string;
            name?: string;
            /** Whether Obsidian turns it on in a new vault. */
            defaultOn?: boolean;
            /** Its settings, from .obsidian/<id>.json. */
            options?: unknown;
            onExternalSettingsChange?(): Promise<void> | void;
          };
          enable?(save: boolean): Promise<void>;
          disable?(save: boolean): Promise<void>;
        }
      >;
      /** "change" fires after a core plugin is turned on or off. */
      on?(name: "change", callback: (plugin: unknown) => unknown): EventRef;
    };
    /** Community plugins: `plugins` holds the loaded (enabled) ones by id. */
    plugins?: {
      plugins?: Record<string, unknown>;
      /** Installed plugins' manifests, by id (enabled or not). */
      manifests?: Record<string, PluginManifest | undefined>;
      /** Ids in community-plugins.json. */
      enabledPlugins?: Set<string>;
      /** Loads a plugin without changing community-plugins.json. */
      enablePlugin?(id: string): Promise<boolean>;
      disablePlugin?(id: string): Promise<void>;
      enablePluginAndSave?(id: string): Promise<boolean>;
      disablePluginAndSave?(id: string): Promise<void>;
      /** Obsidian's installer: downloads the release `version` of `repo` and writes .obsidian/plugins/<id>/. */
      installPlugin?(repo: string, version: string, manifest: PluginManifest): Promise<unknown>;
      uninstallPlugin?(id: string): Promise<void>;
      loadManifests?(): Promise<void>;
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
      onClose?(): void;
      activeTab?: {
        /** "file" (Files and links), "plugins" (Core plugins), "hotkeys", or a plugin's id. */
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
      /** The widget objects render() returns are checked with isDateWidget (properties.ts) before use. */
      registeredTypeWidgets?: Record<string, { render?(el: HTMLElement, value: unknown, ctx: unknown): unknown }>;
      /** Lower-cased property name -> its name and the widget type it's shown with ("date", "datetime", "text"…). */
      getAllProperties?(): Record<string, { name: string; widget?: string }>;
      /** "changed" with a lower-cased property name redraws that property in every open note and Base. */
      trigger?(name: "changed", key: string): void;
      /** Sets a property's type (writes types.json). */
      setType?(name: string, widget: string): Promise<void>;
      unsetType?(name: string): Promise<void>;
    };
  }
  interface Vault {
    /** app.json and appearance.json as Obsidian holds them (keys set; getConfig falls back to the defaults). */
    config?: Record<string, unknown>;
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
    /** Editor suggesters: Obsidian's [[ link suggester (see isCoreLinkSuggest in main.ts) and plugins' ones. */
    editorSuggest?: { suggests: EditorSuggest<unknown>[] };
  }
}
