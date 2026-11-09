// The e2e suite's fixtures, in one place: e2e/make-vault.mjs writes them on disk when e2e/sandbox.sh makes a vault,
// and the runner's prepare step (lib.mjs) creates whatever is missing in the running vault. Every path is the suite's
// own (under _test/), so a copy of a real vault (OBS_VAULT) only gains these files.

/** Notes, by vault path. */
export const NOTES = {
  // picked from the [[ dropdown: typing PICK_QUERY finds it first; the near-miss keeps the ranking honest
  "_test/ed-z/Ed pick target.md": "# Ed pick target\n",
  "_test/ed-z/Ed pick tangle.md": "# Ed pick tangle\n",
  // picked by its alias
  "_test/ed-n/Ed person.md": "---\naliases:\n  - Edalias\n---\n# Ed person\n",
  // heading and block picks
  "_test/ed-target.md": "# Goals\n\nfirst para\n\nsecond para ^abc\n",
  // Templater: Alt+N, "ed-zettel" makes a note from it, which moves itself into _test/ed-new/
  "_test/ed-templates/ed-zettel.md":
    '---\ntype: ed-zettel\n---\n<%* await tp.file.move("_test/ed-new/" + tp.date.now("YYYYMMDDHHmmss")) -%>\n',
};

/** Paths the tests use. */
export const PATHS = {
  pick: "_test/ed-z/Ed pick target.md",
  person: "_test/ed-n/Ed person.md",
  target: "_test/ed-target.md",
  template: "_test/ed-templates/ed-zettel.md",
  templatesFolder: "_test/ed-templates",
  newNotes: "_test/ed-new",
  // everything a "tab" case opens is in this folder, so one Editor Multiple Lanes routing exception keeps it in tabs
  tabFolder: "_test/ed-tab/",
  tab: "_test/ed-tab/note.md",
  lane: "_test/ed-lane.md",
  canvas: "_test/ed-tab/ed.canvas",
  card: "_test/ed-tab/card.md",
};

/** The query that finds PATHS.pick, and the link a pick of it gives with absolute links. */
export const PICK_QUERY = "Ed pick targ";
export const PICK_LINK = "_test/ed-z/Ed pick target";

/** Property types (types.json) of the fixture notes' properties. */
export const TYPES = { ed_created: "datetime", ed_due: "date", ed_org: "multitext", ed_src: "text" };

/** The settings note the suite uses (its own path, so a copy of a real vault keeps its note): what the cases expect. */
export const SETTINGS_NOTE = "_test/ed-settings.md";
export const WANT = {
  attachmentFolder: "u",
  config: { newLinkFormat: "absolute", trashOption: "local" },
  corePlugins: [
    { id: "bases", name: "Bases", enabled: true },
    { id: "templates", name: "Templates", enabled: false, onlyWith: { id: "templater-obsidian", name: "Templater" } },
    { id: "zk-prefixer", name: "Unique note creator", enabled: false },
    {
      id: "backlink",
      name: "Backlinks",
      enabled: false,
      onlyWith: { id: "backlinks-full-view", name: "Backlinks Full View" },
    },
  ],
  hotkeys: [
    {
      command: "app:go-back",
      keys: [
        { modifiers: ["Mod", "Alt"], key: "ArrowLeft" },
        { modifiers: ["Mod"], key: "[" },
      ],
    },
    {
      command: "app:go-forward",
      keys: [
        { modifiers: ["Mod", "Alt"], key: "ArrowRight" },
        { modifiers: ["Mod"], key: "]" },
      ],
    },
    { command: "templater-obsidian:create-new-note-from-template", keys: [{ modifiers: ["Alt"], key: "N" }] },
    { command: "templater-obsidian:insert-templater", keys: [] },
  ],
};
const hk = keys => `[${keys.map(k => JSON.stringify([...k.modifiers, k.key].join("+"))).join(", ")}]`;
export const SETTINGS_TEXT = `# Vault settings

The suite's settings note.

## Obsidian

\`\`\`vault-settings
obsidian: app
settings:
  newLinkFormat: ${WANT.config.newLinkFormat}
  attachmentFolderPath: ${WANT.attachmentFolder}
  trashOption: ${WANT.config.trashOption}
\`\`\`

## Core plugins

\`\`\`vault-settings
obsidian: core-plugins
settings:
${WANT.corePlugins.map(r => (r.onlyWith ? `  ${r.id}: { enabled: ${r.enabled}, onlyWith: ${r.onlyWith.id} }` : `  ${r.id}: ${r.enabled}`)).join("\n")}
\`\`\`

## Hotkeys

\`\`\`vault-settings
obsidian: hotkeys
settings:
${WANT.hotkeys.map(h => `  ${h.command}: ${hk(h.keys)}`).join("\n")}
\`\`\`

## Editor Defaults (Archit)

\`\`\`vault-settings
plugin: editor-defaults-archit
source: github:archit90/obsidian-editor-defaults-archit
\`\`\`
`;
NOTES[SETTINGS_NOTE] = SETTINGS_TEXT;
