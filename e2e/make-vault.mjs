// Run by e2e/sandbox.sh once it has made a sandbox's vault, before Obsidian starts: `node e2e/make-vault.mjs <vault>`.
// Writes the suite's fixtures (e2e/fixtures.mjs) on disk. Idempotent; in a copy of another vault (OBS_VAULT) it only
// adds or refreshes the suite's own paths and property types, and never rewrites anything else.
// - the fixture notes, and the types of their properties in .obsidian/types.json;
// - Templater, when it's installed in the vault without settings: its templates folder is the suite's
//   (_test/ed-templates). A vault whose Templater has settings keeps them, and gets the suite's template in its
//   templates folder as well.
import fs from "node:fs";
import path from "node:path";
import { NOTES, PATHS, TYPES } from "./fixtures.mjs";

const vault = process.argv[2];
if (!vault || !fs.existsSync(path.join(vault, ".obsidian"))) {
  console.error("usage: node e2e/make-vault.mjs <vault> (a folder with .obsidian/)");
  process.exit(2);
}

/** Writes `text` to the vault path `p` unless it's there already. */
function put(p, text) {
  const f = path.join(vault, p);
  if (fs.existsSync(f) && fs.readFileSync(f, "utf8") === text) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);

for (const [p, text] of Object.entries(NOTES)) put(p, text);

const typesFile = path.join(vault, ".obsidian", "types.json");
const types = readJson(typesFile, { types: {} });
types.types = { ...types.types, ...TYPES };
fs.writeFileSync(typesFile, JSON.stringify(types, null, 2));

const templater = path.join(vault, ".obsidian", "plugins", "templater-obsidian");
if (fs.existsSync(path.join(templater, "manifest.json"))) {
  const dataFile = path.join(templater, "data.json");
  const data = readJson(dataFile, null);
  if (data === null) fs.writeFileSync(dataFile, JSON.stringify({ templates_folder: PATHS.templatesFolder }, null, 2));
  else if (
    typeof data.templates_folder === "string" &&
    data.templates_folder &&
    data.templates_folder !== PATHS.templatesFolder
  )
    put(`${data.templates_folder}/${path.basename(PATHS.template)}`, NOTES[PATHS.template]);
}
console.log(`fixtures in ${vault}`);
