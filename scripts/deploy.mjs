// Copies this plugin's build into Obsidian vaults, to try a local build before it's released:
//
//   npm run deploy -- <vault> [<vault> …]     builds, then copies main.js, manifest.json and styles.css
//   OBSIDIAN_VAULTS=<vault>:<vault> npm run deploy
//
// A vault only gets the plugin if it's already installed there (.obsidian/plugins/<id>/ exists); --install
// creates the folder (then enable the plugin in Settings → Community plugins). The plugin's settings
// (data.json) are never touched. Reload the plugin in Obsidian afterwards.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const install = args.includes("--install");
const listed = args.filter(a => a !== "--install");
const fromEnv = (process.env.OBSIDIAN_VAULTS ?? "").split(path.delimiter).filter(Boolean);
const vaults = (listed.length ? listed : fromEnv).map(v => path.resolve(v.replace(/^~(?=$|[\\/])/, os.homedir())));
if (!vaults.length) {
  console.error("usage: npm run deploy -- [--install] <vault> [<vault> …]   (or set OBSIDIAN_VAULTS)");
  process.exit(2);
}
const { id } = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const files = ["main.js", "manifest.json", "styles.css"].filter(f => fs.existsSync(f));
if (!files.includes("main.js")) throw new Error("no main.js: build first (npm run build)");
let failed = 0;
for (const vault of vaults) {
  if (!fs.existsSync(path.join(vault, ".obsidian"))) {
    console.error(`not an Obsidian vault (no .obsidian/): ${vault}`);
    failed++;
    continue;
  }
  const dest = path.join(vault, ".obsidian", "plugins", id);
  if (!fs.existsSync(dest)) {
    if (!install) {
      console.log(`skip ${vault}: ${id} isn't installed there (--install to add it)`);
      continue;
    }
    fs.mkdirSync(dest, { recursive: true });
  }
  for (const f of files) fs.copyFileSync(f, path.join(dest, f));
  console.log(`${id} -> ${dest}`);
}
process.exit(failed ? 1 : 0);
