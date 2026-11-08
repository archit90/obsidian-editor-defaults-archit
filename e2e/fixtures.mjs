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
