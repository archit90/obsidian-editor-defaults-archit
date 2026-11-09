// The checks of e2e/restart.sh, against the sandbox Obsidian that just started (CDP_PORT, default sandbox 2's):
//   node e2e/a1-check.mjs prepare   opens what a restart must bring back: a Bases tab, then a date note (the active tab)
//   node e2e/a1-check.mjs <case>    checks, printing PASS/FAIL <case> (exit 1 on FAIL):
//     - every default (src/defaults.json, for the plugins enabled there) is in app.json, core-plugins.json and
//       hotkeys.json on disk;
//     - the load was silent: no notice from Editor Defaults (Archit);
//     - no console error from it since the page loaded (Runtime.enable replays the messages logged before);
//     - with `--restored`: the date note restored as the active tab shows ISO date fields, and the Bases tab restored
//       in the background is still deferred (the plugin no longer rebuilds Bases tabs at start), then ISO once shown.
import fs from "node:fs";
import path from "node:path";
import { assertSandboxVault, connect } from "./cdp.mjs";
import { PATHS, WANT } from "./fixtures.mjs";

const [what, flag] = process.argv.slice(2);
const D = WANT;
const A1_NOTE = `${PATHS.tabFolder}a1.md`;
const A1_BASE = `${PATHS.tabFolder}a1.base`;
const A1_ROW = `${PATHS.tabFolder}a1-row.md`;
const DATES = "---\ned_created: 2026-09-10T09:30:00\ned_due: 2026-11-06\n---\n";

const c = await connect();
// before anything else: console messages logged since the page loaded are replayed once Runtime is enabled
const errors = [];
c.on("Runtime.consoleAPICalled", p => {
  if (p.type === "error") errors.push(p.args.map(a => a.value ?? a.description ?? "").join(" "));
});
c.on("Runtime.exceptionThrown", p =>
  errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? "exception"),
);
await c.send("Runtime.enable");
const vault = await assertSandboxVault(c);
const ev = body => c.ev(`(async()=>{ ${body} })()`);
await new Promise(r => setTimeout(r, 500));

if (what === "prepare") {
  // the fixtures this needs (fixtures.mjs makes their property types; the e2e suite's prepare step does too)
  await ev(`
    const m = app.metadataTypeManager; m.setType("ed_created", "datetime"); m.setType("ed_due", "date");
    const put = async (p, t) => { for (const d of [p.split("/").slice(0, -1).join("/")]) if (d && !app.vault.getAbstractFileByPath(d)) await app.vault.createFolder(d).catch(() => {}); let f = app.vault.getAbstractFileByPath(p); if (!f) f = await app.vault.create(p, t); else await app.vault.modify(f, t); return f; };
    await put(${JSON.stringify(A1_ROW)}, ${JSON.stringify(DATES + "x\n")});
    const base = await put(${JSON.stringify(A1_BASE)}, 'filters:\\n  and:\\n    - file.name.startsWith("a1-row")\\nviews:\\n  - type: table\\n    name: T\\n    order:\\n      - file.name\\n      - ed_created\\n      - ed_due\\n');
    const note = await put(${JSON.stringify(A1_NOTE)}, ${JSON.stringify(DATES + "body\n")});
    await app.workspace.getLeaf("tab").openFile(base);
    await new Promise(r => setTimeout(r, 1000));
    const l = app.workspace.getLeaf("tab");
    await l.openFile(note, { state: { mode: "source", source: false } });
    app.workspace.setActiveLeaf(l, { focus: true });
    await new Promise(r => setTimeout(r, 1000));
    app.workspace.requestSaveLayout?.();
    await new Promise(r => setTimeout(r, 2500));
    return 1`);
  console.log("prepared: a Bases tab and a date note to come back after the restart");
  process.exit(0);
}

// a fresh vault: the first load asks once (this device hasn't been set up from the note); Apply the note
let dialog = null;
if (flag === "--dialog") {
  for (let i = 0; i < 40 && !dialog; i++) {
    dialog = await ev(
      `const m=[...document.querySelectorAll(".modal")].find(m=>/Set up this vault/.test(m.innerText)); if(!m) return null; const t=m.innerText; [...m.querySelectorAll("button")].find(b=>b.innerText==="Apply the note")?.click(); return t`,
    );
    if (!dialog) await new Promise(r => setTimeout(r, 250));
  }
  await new Promise(r => setTimeout(r, 2500));
}
const read = f => {
  const p = path.join(vault, ".obsidian", f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
};
const [appJson, core, hotkeys] = ["app.json", "core-plugins.json", "hotkeys.json"].map(read);
const loaded = await ev(`return Object.keys(app.plugins.plugins)`);
const wantCore = D.corePlugins.filter(r => !r.onlyWith || loaded.includes(r.onlyWith.id));
const disk = {
  link: appJson.newLinkFormat === D.config.newLinkFormat,
  trash: appJson.trashOption === D.config.trashOption,
  att: appJson.attachmentFolderPath === D.attachmentFolder,
  core: wantCore.every(r => core[r.id] === r.enabled),
  hotkeys: D.hotkeys.every(h => JSON.stringify(hotkeys[h.command]) === JSON.stringify(h.keys)),
};
const notices = await ev(`return [...document.querySelectorAll(".notice")].map(n => n.textContent)`);
const loud = notices.filter(n => /Editor Defaults/.test(n));
// from this plugin: its log prefix, or a stack through its code (the sandbox's path has the repo's name in it)
const mine = errors.filter(e => /\[editor-defaults\]|plugin:editor-defaults-archit/.test(e));
let restored = null;
if (flag === "--restored")
  restored = await ev(`
    const field = (root, k) => root.querySelector('.metadata-property[data-property-key="' + k + '"] .metadata-property-value > input:first-child');
    const note = app.workspace.getLeavesOfType("markdown").find(l => l.view.file?.path === ${JSON.stringify(A1_NOTE)});
    const base = app.workspace.getLeavesOfType("bases").find(l => l.view.file?.path === ${JSON.stringify(A1_BASE)} || l.getViewState().state?.file === ${JSON.stringify(A1_BASE)});
    const out = { active: app.workspace.getActiveFile()?.path ?? null, note: null, baseDeferred: base?.isDeferred ?? null, base: null };
    if (note) { const e = field(note.view.containerEl, "ed_created"); out.note = e ? e.type + ":" + e.value : "no field"; }
    if (base) {
      await base.loadIfDeferred?.();
      app.workspace.setActiveLeaf(base, { focus: false });
      await new Promise(r => setTimeout(r, 1500));
      out.base = [...base.view.containerEl.querySelectorAll(".bases-td[data-property^='note.ed_'] input:first-child")].map(i => i.type + ":" + i.value);
    }
    return out`);
const okRestored =
  !restored ||
  (restored.note === "text:2026-09-10 09:30:00" &&
    restored.baseDeferred === true &&
    JSON.stringify(restored.base) === JSON.stringify(["text:2026-09-10 09:30:00", "text:2026-11-06"]));
const pass =
  Object.values(disk).every(Boolean) &&
  loud.length === 0 &&
  mine.length === 0 &&
  okRestored &&
  (flag !== "--dialog" || /Deleted files/.test(dialog ?? ""));
console.log(
  `${pass ? "PASS" : "FAIL"} ${what}`,
  JSON.stringify({ disk, notices: loud, errors: mine, restored, dialog: dialog?.slice(0, 200) ?? null }),
);
if (errors.length > mine.length)
  console.log(
    "other console errors:",
    errors.filter(e => !mine.includes(e)),
  );
process.exit(pass ? 0 : 1);
