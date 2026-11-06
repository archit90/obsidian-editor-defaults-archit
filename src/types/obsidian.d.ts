// Obsidian internals this plugin relies on (not in the public API). Checked against Obsidian 1.15.0.
import "obsidian";

declare module "obsidian" {
  interface App {
    hotkeyManager?: {
      getHotkeys?(commandId: string): Hotkey[] | undefined;
      setHotkeys(commandId: string, keys: Hotkey[]): void;
      save?(): Promise<void>;
    };
    internalPlugins?: {
      plugins: Record<
        string,
        { enabled: boolean; enable?(save: boolean): Promise<void>; disable?(save: boolean): Promise<void> }
      >;
    };
  }
  interface Vault {
    getConfig?(key: string): unknown;
    setConfig?(key: string, value: unknown): void;
  }
  interface Workspace {
    /** Editor suggesters, including the built-in [[ link suggester. */
    editorSuggest?: { suggests: EditorSuggest<unknown>[] };
  }
}
