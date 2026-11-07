// Full Editor Defaults catalogue run against sandbox 2 (CDP 9312). node run.mjs [--filter re]
import fs from "node:fs";
import { setup, sleep } from "./lib.mjs";

const c = await setup();
const P = `app.plugins.plugins["obsidian-editor-defaults"]`;
const args = process.argv.slice(2);
const filter = args.includes("--filter") ? new RegExp(args[args.indexOf("--filter") + 1]) : null;
const results = [];
const ev = b => c.ev2(b);

// ---------- helpers ----------
const KEYS = { "[": [219, "BracketLeft"], "]": [221, "BracketRight"], ArrowLeft: [37, "ArrowLeft"], ArrowRight: [39, "ArrowRight"] };
async function chord(k, mods) {
  const m = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0);
  const [vk, code] = KEYS[k];
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
}
async function charKey(ch, code, vk, shift) {
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, code, modifiers: shift ? 8 : 0, windowsVirtualKeyCode: vk, text: ch, unmodifiedText: ch });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code, modifiers: shift ? 8 : 0, windowsVirtualKeyCode: vk });
}
const hash = () => charKey("#", "Digit3", 51, true);
const caret = () => charKey("^", "Digit6", 54, true);
const cfg = () => ev(`return E.cfg()`);
const notices = () => ev(`const docs=new Set([document]); if (app.setting.activeTab?.containerEl) docs.add(app.setting.activeTab.containerEl.doc); return [...docs].flatMap(d=>[...d.querySelectorAll(".notice")].map(n=>n.textContent))`);
const clearNotices = () => ev(`const docs=new Set([document]); if (app.setting.activeTab?.containerEl) docs.add(app.setting.activeTab.containerEl.doc); docs.forEach(d=>d.querySelectorAll(".notice").forEach(n=>n.remove())); return 1`);
const setPlugin = (k, v) => ev(`${P}.settings[${JSON.stringify(k)}]=${JSON.stringify(v)}; await ${P}.${k === "isoDates" ? "isoDatesChanged" : "saveSettings"}(); return 1`);
const readFile = p => ev(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(p)}); return f? await app.vault.read(f) : null`);
const modal = () => ev(`const m=document.querySelector(".modal-container .prompt"); return m? (m.querySelector(".prompt-input")?.placeholder||"prompt") : null`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const WANT_HK = {
  "app:go-back": [{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }, { modifiers: ["Mod"], key: "[" }],
  "app:go-forward": [{ modifiers: ["Mod", "Alt"], key: "ArrowRight" }, { modifiers: ["Mod"], key: "]" }],
  "templater-obsidian:create-new-note-from-template": [{ modifiers: ["Alt"], key: "N" }],
  "templater-obsidian:insert-templater": [],
};
const WANT_CORE = { bases: true, templates: false, "zk-prefixer": false, backlink: false };
const okCfg = x => x.link === "absolute" && x.att === "u" && x.trash === "local" && eq(x.core, WANT_CORE) && eq(x.hk, WANT_HK);

async function settingsTab(id) {
  await ev(`if(!app.setting.isOpen) app.setting.open(); app.setting.openTabById(${JSON.stringify(id)}); await E.sleep(500); return 1`);
}
const closeSettings = () => ev(`app.setting.close(); return 1`);
const settingItem = name => `[...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.offsetParent && i.querySelector(".setting-item-name")?.textContent===${JSON.stringify(name)})`;

// link picking in the editor: open surface with "see ", type [[ + query, run steps, return text
async function linkPick(surface, steps, text = "see ") {
  await ev(`return await E.open(${JSON.stringify(surface)}, ${JSON.stringify(text)})`);
  await c.type("[[");
  for (const s of steps) {
    if (typeof s === "function") await s();
    else if (s.k) await c.key(s.k, s.m || {});
    else await c.type(s);
    await sleep(650);
  }
  await sleep(300);
  const out = await ev(`return E.text()`);
  await c.key("Escape");
  return out;
}
// link picking in a property field
async function propPick(surface, key, steps) {
  await ev(`return await E.open(${JSON.stringify(surface)}, "---\\nsrc: \\norg: []\\n---\\nbody")`);
  await sleep(900);
  const r = await ev(`const doc=E.cm.dom.ownerDocument; const el=[...doc.querySelectorAll('.metadata-property[data-property-key="${key}"] .metadata-property-value [contenteditable]')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]; if(!el) return "no field"; el.focus(); return "ok"`);
  if (r !== "ok") return r;
  await c.type("[[");
  for (const s of steps) {
    if (typeof s === "function") await s();
    else if (s.k) await c.key(s.k, s.m || {});
    else await c.type(s);
    await sleep(800);
  }
  await sleep(500);
  await ev(`E.cm.dom.ownerDocument.activeElement?.blur?.(); return 1`);
  await sleep(1300);
  const t = await readFile(surface.startsWith("canvas") ? "_test/ed-card.md" : surface === "lanes" ? "_test/ed-lane.md" : "_test/ed-tab.md");
  return t.split("---")[1].trim();
}
// date fields
const DATE_NOTE = "---\ncreated: 2026-09-10T09:30:00\ndue: 2026-11-06\n---\nbody";
const dateField = k => `[...E.cm.dom.ownerDocument.querySelectorAll('.metadata-property[data-property-key="${k}"] .metadata-property-value > input:first-child')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]`;
const notePath = s => (s.startsWith("canvas") ? "_test/ed-card.md" : s === "lanes" ? "_test/ed-lane.md" : "_test/ed-tab.md");
async function dateType(surface, k, text, end = "Enter") {
  await ev(`const el=${dateField(k)}; el.focus(); el.select(); return 1`);
  await c.key("Backspace");
  if (text) await c.type(text);
  await sleep(200);
  const st = await ev(`const el=${dateField(k)}; return {v:el.value, invalid:el.getAttribute("aria-invalid"), outline:el.style.outline}`);
  await clearNotices();
  await c.key(end);
  await sleep(1200);
  const fm = (await readFile(notePath(surface))).split("---")[1].trim();
  const after = await ev(`const el=${dateField(k)}; return {v:el?.value, invalid:el?.getAttribute("aria-invalid"), outline:el?.style.outline}`);
  return { st, fm, shown: after.v, after, notices: await notices() };
}

// ---------- the cases ----------
const cases = [];
const T = (id, title, fn) => cases.push({ id, title, fn });

T("A2", "Disable + enable the plugin re-applies drifted defaults", async () => {
  await ev(`await app.plugins.disablePlugin("obsidian-editor-defaults"); app.vault.setConfig("newLinkFormat","shortest"); app.vault.setConfig("trashOption","system"); app.vault.setConfig("attachmentFolderPath","./"); await app.internalPlugins.plugins.backlink.enable(true); await app.internalPlugins.plugins.bases.disable(true); app.hotkeyManager.setHotkeys("app:go-back",[]); app.hotkeyManager.removeHotkeys("templater-obsidian:insert-templater"); await app.hotkeyManager.save(); await E.sleep(800); return 1`);
  const drifted = await cfg();
  await ev(`await app.plugins.enablePlugin("obsidian-editor-defaults"); await E.sleep(1500); return 1`);
  const after = await cfg();
  return [okCfg(after) && !okCfg(drifted), { drifted: [drifted.link, drifted.trash, drifted.att, drifted.core.backlink, drifted.core.bases], after }];
});
T("A3", "Applying when everything is already right writes nothing (idempotent)", async () => {
  const r = await ev(`const fs=require("fs"), base=app.vault.adapter.basePath+"/.obsidian/"; const m=()=>["app.json","hotkeys.json","core-plugins.json"].map(f=>fs.statSync(base+f).mtimeMs); await E.sleep(1200); const a=m(); const out=await ${P}.applyDefaults(); await E.sleep(1500); const b=m(); return {a,b,out}`);
  return [eq(r.a, r.b) && r.out.length === 0, r];
});
T("A4", "Disabling the plugin removes every patch and stops enforcing; enabling brings them back", async () => {
  await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(700); return 1`);
  await ev(`await app.plugins.disablePlugin("obsidian-editor-defaults"); await E.sleep(600); return 1`);
  const off = await ev(`const s=app.workspace.editorSuggest.suggests[0]; return {suggestOwn: Object.hasOwn(s,"selectSuggestion"), flag: !!s.__editorDefaultsPatched, hmSave: Object.hasOwn(app.hotkeyManager,"save"), hmLoad: false, due: ${dateField("due")}?.type}`).catch(e => ({ err: String(e) }));
  const linkOff = await linkPick("tab", ["Abstraction delays tru", { k: "Enter" }]);
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(800); return 1`);
  const linkCfgOff = (await cfg()).link;
  await ev(`await app.plugins.enablePlugin("obsidian-editor-defaults"); await E.sleep(1500); return 1`);
  const on = await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(700); const s=app.workspace.editorSuggest.suggests[0]; return {suggestOwn: Object.hasOwn(s,"selectSuggestion"), hmSave: Object.hasOwn(app.hotkeyManager,"save"), due: ${dateField("due")}?.type, link: app.vault.getConfig("newLinkFormat")}`);
  const linkOn = await linkPick("tab", ["Abstraction delays tru", { k: "Enter" }]);
  const pass = !off.suggestOwn && !off.flag && !off.hmSave && !off.hmLoad && off.due === "date" && /\|Abstraction delays trust\]\]/.test(linkOff) && linkCfgOff === "shortest" && on.suggestOwn && on.hmSave && on.due === "text" && on.link === "absolute" && linkOn === "see [[z/Abstraction delays trust]]";
  return [pass, { off, linkOff, linkCfgOff, on, linkOn }];
});
T("A6", "Templater disabled: no errors, hotkeys still written by id; Alt+N back once Templater is on", async () => {
  await ev(`E.errs.length=0; await app.plugins.disablePlugin("templater-obsidian"); app.hotkeyManager.removeHotkeys("templater-obsidian:create-new-note-from-template"); await app.hotkeyManager.save(); await E.sleep(1000); return 1`);
  const hk = (await cfg()).hk["templater-obsidian:create-new-note-from-template"];
  await ev(`await E.open("tab","abc"); return 1`);
  await c.key("n", { alt: true });
  await sleep(700);
  const m1 = await modal();
  if (m1) await c.key("Escape");
  await ev(`await app.plugins.enablePlugin("templater-obsidian"); await E.sleep(1500); await E.open("tab","abc"); return 1`);
  await c.key("n", { alt: true });
  await sleep(800);
  const m2 = await modal();
  if (m2) await c.key("Escape");
  const errs = (await ev(`return E.errs`)).filter(e => /editor-defaults/.test(e));
  return [eq(hk, WANT_HK["templater-obsidian:create-new-note-from-template"]) && !m1 && !!m2 && errs.length === 0, { hk, m1, m2, errs }];
});
T("A7", "Settings saved partly (old data.json) are merged with the defaults", async () => {
  const r = await ev(`const p=${P}; const d=await p.loadData(); await p.saveData({forceTrash:false}); await app.plugins.disablePlugin("obsidian-editor-defaults"); await app.plugins.enablePlugin("obsidian-editor-defaults"); await E.sleep(800); const s={...app.plugins.plugins["obsidian-editor-defaults"].settings}; await app.plugins.plugins["obsidian-editor-defaults"].saveData(d ?? {}); await app.plugins.disablePlugin("obsidian-editor-defaults"); await app.plugins.enablePlugin("obsidian-editor-defaults"); await E.sleep(800); return s`);
  return [r.forceTrash === false && r.forceRootPaths === true && r.isoDates === true && r.attachmentFolder === "u", r];
});

// ----- B: vault settings -----
T("B2", "Settings → Files and links: changing New link format is put back, with a notice, and the dropdown shows it", async () => {
  await settingsTab("file");
  await clearNotices();
  await ev(`const s=${settingItem("New link format")}.querySelector("select"); s.value="shortest"; s.dispatchEvent(new Event("change")); return 1`);
  await sleep(1000);
  const r = { link: (await cfg()).link, dropdown: await ev(`return ${settingItem("New link format")}.querySelector("select").value`), notices: await notices() };
  return [r.link === "absolute" && r.dropdown === "absolute" && r.notices.some(n => /New link format/.test(n) && /New links use path from vault root/.test(n)), r];
});
T("B9", "Settings → Files and links: changing the attachment location is put back", async () => {
  await settingsTab("file");
  await clearNotices();
  await ev(`const s=${settingItem("Default location for new attachments")}.querySelector("select"); s.value="current"; s.dispatchEvent(new Event("change")); return 1`);
  await sleep(1000);
  const r = { att: (await cfg()).att, dropdown: await ev(`return ${settingItem("Default location for new attachments")}.querySelector("select").value`), notices: await notices() };
  return [r.att === "u" && r.dropdown === "folder" && r.notices.some(n => /Attachment folder/.test(n)), r];
});
T("B11", "Settings → Files and links: changing Deleted files is put back", async () => {
  await settingsTab("file");
  await clearNotices();
  await ev(`const s=${settingItem("Deleted files")}.querySelector("select"); s.value="none"; s.dispatchEvent(new Event("change")); return 1`);
  await sleep(1000);
  const r = { trash: (await cfg()).trash, dropdown: await ev(`return ${settingItem("Deleted files")}.querySelector("select").value`), notices: await notices() };
  await closeSettings();
  return [r.trash === "local" && r.dropdown === "local" && r.notices.some(n => /Deleted files/.test(n)), r];
});
T("B3", "app.json changed on disk (sync) is put back and written back", async () => {
  await clearNotices();
  await sleep(3000);
  await ev(`const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/app.json"; const a=JSON.parse(fs.readFileSync(f,"utf8")); a.newLinkFormat="relative"; a.attachmentFolderPath="att"; fs.writeFileSync(f, JSON.stringify(a,null,2)); return 1`);
  await sleep(3000);
  const r = { cfg: await cfg(), disk: await ev(`const a=JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/app.json","utf8")); return [a.newLinkFormat, a.attachmentFolderPath]`), notices: await notices() };
  return [r.cfg.link === "absolute" && r.cfg.att === "u" && eq(r.disk, ["absolute", "u"]) && r.notices.length > 0, { link: r.cfg.link, att: r.cfg.att, disk: r.disk, notices: r.notices }];
});
T("B4", "With the toggle off, a change in Obsidian's settings stays (no notice); turning it on applies it at once", async () => {
  await setPlugin("forceRootPaths", false);
  await clearNotices();
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(900); return 1`);
  const off = { link: (await cfg()).link, notices: await notices() };
  await setPlugin("forceRootPaths", true);
  const on = (await cfg()).link;
  return [off.link === "shortest" && off.notices.length === 0 && on === "absolute", { off, on }];
});
T("B6", "New attachments go to u/", async () => {
  const p = await ev(`return await app.fileManager.getAvailablePathForAttachment("ed-test.png", "_test/ed-tab.md")`);
  return [p === "u/ed-test.png", p];
});
T("B7", "Attachment folder field: typing doesn't write app.json; leaving the field does", async () => {
  await settingsTab("obsidian-editor-defaults");
  const field = `${settingItem("Attachment folder")}.querySelector("input")`;
  // the settings window is another CDP target: type by input events, one per character, as typing does
  await ev(`const i=${field}; i.focus(); i.value=""; i.dispatchEvent(new Event("input")); for (const ch of "assets") { i.value+=ch; i.dispatchEvent(new Event("input")); await E.sleep(30); } return 1`);
  await sleep(500);
  const typing = (await cfg()).att;
  await ev(`${field}.blur(); ${field}.dispatchEvent(new FocusEvent("blur")); await E.sleep(600); return 1`);
  const blurred = (await cfg()).att;
  await ev(`const i=${field}; i.focus(); i.value="u"; i.dispatchEvent(new Event("input")); i.blur(); i.dispatchEvent(new FocusEvent("blur")); await E.sleep(600); return 1`);
  const back = (await cfg()).att;
  await closeSettings();
  return [typing === "u" && blurred === "assets" && back === "u", { typing, blurred, back }];
});
T("B8", "An empty attachment folder field enforces nothing", async () => {
  await ev(`${P}.settings.attachmentFolder="  "; await ${P}.saveSettings(); app.vault.setConfig("attachmentFolderPath","./"); await E.sleep(900); return 1`);
  const r = (await cfg()).att;
  await ev(`${P}.settings.attachmentFolder="u"; await ${P}.saveSettings(); return 1`);
  const back = (await cfg()).att;
  return [r === "./" && back === "u", { r, back }];
});
T("B10", "Deleting a note moves it to .trash", async () => {
  const r = await ev(`const f=await E.file("_test/ed-del.md","x"); await app.fileManager.trashFile(f); await E.sleep(500); const fs=require("fs"); return {inVault: !!app.vault.getAbstractFileByPath("_test/ed-del.md"), inTrash: fs.existsSync(app.vault.adapter.basePath+"/.trash/ed-del.md")}`);
  return [!r.inVault && r.inTrash, r];
});

// ----- C: core plugins -----
T("C2", "Settings → Core plugins: Backlinks switched on is switched off again, with a notice; the toggle shows it", async () => {
  await settingsTab("plugins");
  await clearNotices();
  await ev(`${settingItem("Backlinks")}.querySelector(".checkbox-container").click(); return 1`);
  await sleep(150);
  const mid = (await cfg()).core.backlink;
  await sleep(1000);
  const r = { mid, core: (await cfg()).core, toggle: await ev(`return ${settingItem("Backlinks")}.querySelector(".checkbox-container").classList.contains("is-enabled")`), notices: await notices() };
  return [r.mid === true && eq(r.core, WANT_CORE) && r.toggle === false && r.notices.some(n => /Backlinks off/.test(n)), r];
});
T("C3", "Settings → Core plugins: Bases off is switched on again; Templates and Unique note creator on are switched off", async () => {
  await settingsTab("plugins");
  await clearNotices();
  for (const name of ["Bases", "Templates", "Unique note creator"]) {
    await ev(`${settingItem(name)}.querySelector(".checkbox-container").click(); return 1`);
    await sleep(100);
  }
  await sleep(1200);
  const r = { core: (await cfg()).core, notices: await notices() };
  return [eq(r.core, WANT_CORE) && r.notices.length > 0, r];
});
T("C4", "With Enforce core plugins off the user's choice stays; other core plugins are never touched", async () => {
  await setPlugin("forceCorePlugins", false);
  await clearNotices();
  await ev(`await app.internalPlugins.plugins.backlink.enable(true); await app.internalPlugins.plugins["daily-notes"].enable(true); await E.sleep(900); return 1`);
  const off = { backlink: (await cfg()).core.backlink, notices: await notices() };
  await setPlugin("forceCorePlugins", true);
  await sleep(500);
  const on = { backlink: (await cfg()).core.backlink, daily: await ev(`return app.internalPlugins.plugins["daily-notes"].enabled`) };
  await ev(`await app.internalPlugins.plugins["daily-notes"].disable(true); return 1`);
  await closeSettings();
  return [off.backlink === true && off.notices.length === 0 && on.backlink === false && on.daily === true, { off, on }];
});

// ----- D: hotkeys -----
T("D1", "Exactly the listed hotkeys, and an explicit [] for the insert template modal", async () => {
  const r = await ev(`return JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/hotkeys.json","utf8"))`);
  const pick = Object.fromEntries(Object.keys(WANT_HK).map(k => [k, r[k]]));
  return [eq(pick, WANT_HK), pick];
});
for (const s of ["tab", "lanes", "canvas-text", "canvas-file"])
  T(`D2-${s}`, `Alt+N opens Templater's create-from-template picker (${s}); Alt+E opens nothing`, async () => {
    await ev(`return await E.open(${JSON.stringify(s)}, "abc")`);
    await sleep(300);
    await c.key("n", { alt: true });
    await sleep(800);
    const m = await modal();
    if (m) await c.key("Escape");
    await sleep(300);
    await ev(`E.editor.focus(); return 1`);
    await c.key("e", { alt: true });
    await sleep(700);
    const m2 = await modal();
    if (m2) await c.key("Escape");
    return [/template/i.test(m || "") && !m2, { altN: m, altE: m2, text: await ev(`return E.text()`) }];
  });
T("D2-explorer", "Alt+N works with the file explorer focused (no editor)", async () => {
  await ev(`const l=app.workspace.getLeavesOfType("file-explorer")[0]; app.workspace.setActiveLeaf(l,{focus:true}); l.view.containerEl.querySelector(".nav-files-container")?.focus(); return 1`);
  await c.key("n", { alt: true });
  await sleep(800);
  const m = await modal();
  if (m) await c.key("Escape");
  return [/template/i.test(m || ""), m];
});
for (const s of ["tab", "lanes", "canvas-text"])
  T(`D3-${s}`, `Alt+N, pick "zettel": a new note from the template; the note you were in is unchanged (${s})`, async () => {
    await ev(`if(!E.created){E.created=[]; app.vault.on("create", f=>E.created.push(f.path)); app.vault.on("rename", (f,o)=>E.created.push(f.path));} E.created.length=0; return await E.open(${JSON.stringify(s)}, "abc")`);
    await c.key("n", { alt: true });
    await sleep(800);
    await c.type("zettel");
    await sleep(500);
    await c.key("Enter");
    await sleep(2500);
    const r = await ev(`const made=E.created.filter(p=>/^z\\/\\d+\\.md$/.test(p)); const f=made[0] && app.vault.getAbstractFileByPath(made[0]); const content = f? await app.vault.read(f) : ""; const orig = await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(s.startsWith("canvas") ? "_test/ed.canvas" : notePath(s))})); for (const p of made) { const g=app.vault.getAbstractFileByPath(p); if (g) { for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view.file===g) l.detach(); await app.vault.delete(g); } } return {made, typeZettel: /type: zettel/.test(content), orig: orig.slice(0,40)}`);
    return [r.made.length === 1 && r.typeZettel && (s.startsWith("canvas") || r.orig === "abc"), r];
  });
T("D5", "Ctrl+[ / Ctrl+] and Ctrl+Alt+←/→ navigate back and forward, also with the cursor in a list item", async () => {
  await ev(`await E.routeException("_test/ed-navA.md"); await E.routeException("_test/ed-navB.md"); await E.file("_test/ed-navA.md","- a\\n  - b"); await E.file("_test/ed-navB.md","B"); const l=app.workspace.getLeaf("tab"); E.leafA=l; await l.openFile(app.vault.getAbstractFileByPath("_test/ed-navA.md")); await E.sleep(400); await l.openFile(app.vault.getAbstractFileByPath("_test/ed-navB.md")); await E.sleep(400); app.workspace.setActiveLeaf(l,{focus:true}); return 1`);
  const cur = () => ev(`return app.workspace.getActiveFile()?.path`);
  const seq = [];
  for (const [k, m] of [["[", { ctrl: true }], ["]", { ctrl: true }], ["ArrowLeft", { ctrl: true, alt: true }], ["ArrowRight", { ctrl: true, alt: true }]]) {
    await ev(`E.leafA.view.editor?.focus(); return 1`);
    await chord(k, m);
    await sleep(600);
    seq.push(await cur());
  }
  await ev(`await E.leafA.openFile(app.vault.getAbstractFileByPath("_test/ed-navA.md")); await E.sleep(400); const ed=E.leafA.view.editor; ed.focus(); ed.setCursor(1,5); return 1`);
  await chord("[", { ctrl: true });
  await sleep(600);
  seq.push(await cur());
  const a = await readFile("_test/ed-navA.md");
  E: await ev(`E.leafA.detach(); return 1`);
  return [eq(seq, ["_test/ed-navA.md", "_test/ed-navB.md", "_test/ed-navA.md", "_test/ed-navB.md", "_test/ed-navB.md"]) && a === "- a\n  - b", { seq, a }];
});
T("D6", "Settings → Hotkeys: removing Ctrl+[ from Navigate back is put back; the filter stays", async () => {
  await settingsTab("hotkeys");
  await clearNotices();
  const r = await ev(`const t=app.setting.activeTab; const inp=t.containerEl.querySelector(".search-input-container input"); inp.value="Navigate back"; inp.dispatchEvent(new Event("input")); await E.sleep(400); const row=()=>[...t.containerEl.querySelectorAll(".setting-item")].find(i=>i.offsetParent && i.querySelector(".setting-item-name")?.textContent==="Navigate back"); const hk=[...row().querySelectorAll(".setting-hotkey")].find(h=>/\\[/.test(h.textContent)); hk.querySelector(".setting-hotkey-icon, .setting-delete-hotkey").click(); await E.sleep(100); const mid=app.hotkeyManager.getHotkeys("app:go-back").length; await E.sleep(1000); return {mid, hk: app.hotkeyManager.getHotkeys("app:go-back"), filter: inp.value, rows: [...t.containerEl.querySelectorAll(".setting-item")].filter(i=>i.offsetParent).length, shown: [...row().querySelectorAll(".setting-hotkey")].map(h=>h.textContent.trim())}`);
  r.notices = await notices();
  return [r.mid === 1 && eq(r.hk, WANT_HK["app:go-back"]) && r.filter === "Navigate back" && r.rows === 1 && r.shown.length === 2 && r.notices.some(n => /Navigate back/.test(n)), r];
});
T("D8", "Settings → Hotkeys: 'Restore default' on Alt+N's command is put back", async () => {
  await clearNotices();
  await ev(`app.hotkeyManager.removeHotkeys("templater-obsidian:create-new-note-from-template"); await app.hotkeyManager.save(); await E.sleep(1000); return 1`);
  const r = { hk: (await cfg()).hk["templater-obsidian:create-new-note-from-template"], notices: await notices() };
  await closeSettings();
  return [eq(r.hk, WANT_HK["templater-obsidian:create-new-note-from-template"]) && r.notices.length > 0, r];
});
T("D7", "hotkeys.json changed on disk (sync) is put back and written back", async () => {
  await sleep(3000);
  await ev(`const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/hotkeys.json"; const h=JSON.parse(fs.readFileSync(f,"utf8")); h["templater-obsidian:insert-templater"]=[{modifiers:["Alt"],key:"E"}]; h["app:go-forward"]=[]; fs.writeFileSync(f, JSON.stringify(h,null,2)); return 1`);
  await sleep(3500);
  const r = await ev(`const h=JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/hotkeys.json","utf8")); return {mem: E.cfg().hk, disk: {ins: h["templater-obsidian:insert-templater"], fwd: h["app:go-forward"]}}`);
  return [eq(r.mem, WANT_HK) && eq(r.disk.ins, []) && eq(r.disk.fwd, WANT_HK["app:go-forward"]), r.disk];
});
T("D9", "With Enforce hotkeys off, the user's hotkeys stay; on again, they're set", async () => {
  await setPlugin("forceHotkeys", false);
  await ev(`app.hotkeyManager.setHotkeys("templater-obsidian:create-new-note-from-template",[{modifiers:["Alt"],key:"M"}]); await app.hotkeyManager.save(); await E.sleep(900); return 1`);
  const off = (await cfg()).hk["templater-obsidian:create-new-note-from-template"];
  await setPlugin("forceHotkeys", true);
  const on = (await cfg()).hk["templater-obsidian:create-new-note-from-template"];
  return [eq(off, [{ modifiers: ["Alt"], key: "M" }]) && eq(on, WANT_HK["templater-obsidian:create-new-note-from-template"]), { off, on }];
});
T("D10", "Another command given Alt+N: a warning names it once per session; its hotkey stays; Templater's still runs", async () => {
  await clearNotices();
  await ev(`app.hotkeyManager.setHotkeys("editor:toggle-bold",[{modifiers:["Alt"],key:"N"}]); await app.hotkeyManager.save(); await E.sleep(1000); return 1`);
  const first = await notices();
  await clearNotices();
  // another drift check (any hotkey save) must not warn again
  await ev(`app.vault.setConfig("trashOption","system"); await E.sleep(1000); app.hotkeyManager.setHotkeys("editor:toggle-italics",[{modifiers:["Alt"],key:"I"}]); await app.hotkeyManager.save(); await E.sleep(1000); return 1`);
  const second = await notices();
  const kept = await ev(`return app.hotkeyManager.getHotkeys("editor:toggle-bold")`);
  await ev(`await E.open("tab","abc"); E.editor.setSelection({line:0,ch:0},{line:0,ch:3}); return 1`);
  await c.key("n", { alt: true });
  await sleep(800);
  const m = await modal();
  if (m) await c.key("Escape");
  const text = await ev(`return E.text()`);
  await ev(`app.hotkeyManager.removeHotkeys("editor:toggle-bold"); app.hotkeyManager.removeHotkeys("editor:toggle-italics"); await app.hotkeyManager.save(); return 1`);
  const warn = first.filter(n => /Alt\+N/.test(n) && /Toggle bold/.test(n) && /Settings → Hotkeys/.test(n));
  return [warn.length === 1 && !second.some(n => /Toggle bold/.test(n)) && eq(kept, [{ modifiers: ["Alt"], key: "N" }]) && !!m && text === "abc", { first, second, kept, modal: m, text }];
});
T("D10b", "A clash already in hotkeys.json is warned about at load (Ctrl+[ on another command)", async () => {
  await clearNotices();
  const r = await ev(`await app.plugins.disablePlugin("obsidian-editor-defaults"); app.hotkeyManager.setHotkeys("editor:toggle-italics",[{modifiers:["Ctrl"],key:"["}]); await app.hotkeyManager.save(); await app.plugins.enablePlugin("obsidian-editor-defaults"); await E.sleep(1500); const kept=app.hotkeyManager.getHotkeys("editor:toggle-italics"); app.hotkeyManager.removeHotkeys("editor:toggle-italics"); await app.hotkeyManager.save(); return kept`);
  const n = await notices();
  return [n.some(x => /Ctrl\+\[/.test(x) && /Navigate back/.test(x) && /Toggle italic/i.test(x)) && eq(r, [{ modifiers: ["Ctrl"], key: "[" }]), { notices: n, kept: r }];
});
T("D11", "Drift guard: something that keeps undoing a default wins after 5 tries in 10 s (no endless fight)", async () => {
  const r = await ev(`let n=0; const ref=app.vault.on("config-changed", k=>{ if(k==="trashOption" && app.vault.getConfig("trashOption")==="local" && n<20){ n++; setTimeout(()=>app.vault.setConfig("trashOption","system"),10);} }); app.vault.setConfig("trashOption","system"); await E.sleep(5000); app.vault.offref(ref); const v=app.vault.getConfig("trashOption"); return {n, v}`);
  await ev(`await E.sleep(10500); app.vault.setConfig("trashOption","none"); await E.sleep(900); return 1`);
  const after = (await cfg()).trash;
  return [r.n === 5 && r.v === "system" && after === "local", { fights: r.n, settled: r.v, afterWindow: after }];
});

// ----- E: link suggest in the editor -----
for (const s of ["tab", "lanes", "canvas-text", "canvas-file"]) {
  T(`E1-${s}`, `[[ pick with Enter inserts [[path]] (${s})`, async () => {
    const t = await linkPick(s, ["Abstraction delays tru", { k: "Enter" }]);
    return [t === "see [[z/Abstraction delays trust]]", t];
  });
  T(`E2-${s}`, `[[ pick with Tab inserts [[path]] (${s})`, async () => {
    const t = await linkPick(s, ["Abstraction delays tru", { k: "Tab" }]);
    return [t === "see [[z/Abstraction delays trust]]", t];
  });
  T(`E3-${s}`, `[[ note, then # and a heading: [[path#Heading]] (${s})`, async () => {
    const t = await linkPick(s, ["ed-target", hash, "Goa", { k: "Enter" }]);
    return [t === "see [[_test/ed-target#Goals]]", t];
  });
}
T("E4", "[[ note, then ^ and a block: [[path#^id]]", async () => {
  const t = await linkPick("tab", ["ed-target", caret, "second", { k: "Enter" }]);
  return [t === "see [[_test/ed-target#^abc]]", t];
});
T("E5", "Picking one of the note's aliases keeps it ([[path|alias]])", async () => {
  const t = await linkPick("tab", ["Maya", { k: "Enter" }]);
  return [t === "see [[n/Maya Iyer|Maya]]", t];
});
T("E6", "A heading typed after the note name gets the full path", async () => {
  const t = await linkPick("tab", ["ed-target#Goa", { k: "Enter" }]);
  return [t === "see [[_test/ed-target#Goals]]", t];
});
T("E7", "Relative and shortest link formats (enforcement off): only the alias goes", async () => {
  await ev(`${P}.settings.forceRootPaths=false; await ${P}.saveSettings(); app.vault.setConfig("newLinkFormat","relative"); return 1`);
  const rel = await linkPick("tab", ["Abstraction delays tru", { k: "Enter" }]);
  const relHead = await linkPick("tab", ["ed-target#Goa", { k: "Enter" }]);
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); return 1`);
  const short = await linkPick("tab", ["Abstraction delays tru", { k: "Enter" }]);
  await setPlugin("forceRootPaths", true);
  return [rel === "see [[../z/Abstraction delays trust]]" && relHead === "see [[ed-target#Goals]]" && short === "see [[Abstraction delays trust]]", { rel, relHead, short }];
});
T("E9", "Insert without alias off: Obsidian's [[path|name]] stays", async () => {
  await setPlugin("stripAlias", false);
  const t = await linkPick("tab", ["Abstraction delays tru", { k: "Enter" }]);
  await setPlugin("stripAlias", true);
  return [t === "see [[z/Abstraction delays trust|Abstraction delays trust]]", t];
});
T("E10", "Retargeting [[old|my words]] keeps my words", async () => {
  await ev(`await E.open("tab", "see [[old|my words]]"); E.editor.setSelection({line:0,ch:6},{line:0,ch:9}); return 1`);
  await c.type("Abstraction delays tru");
  await sleep(800);
  await c.key("Enter");
  await sleep(400);
  const t = await ev(`return E.text()`);
  return [t === "see [[z/Abstraction delays trust|my words]]", t];
});
T("E11", "Shift+Enter (keep the typed text) is untouched", async () => {
  const t = await linkPick("tab", ["Abstraction delays tru", { k: "Enter", m: { shift: true } }]);
  return [t === "see [[Abstraction delays tru]]", t];
});
T("E12", "Clicking a suggestion with the mouse inserts [[path]]", async () => {
  const t = await linkPick("tab", [
    "Abstraction delays tru",
    async () => {
      const r = await ev(`const el=document.querySelector(".suggestion-container .suggestion-item.is-selected") || document.querySelector(".suggestion-container .suggestion-item"); const b=el.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2}`);
      await c.click(r.x, r.y);
    },
  ]);
  return [t === "see [[z/Abstraction delays trust]]", t];
});
// ----- E: properties -----
for (const s of ["tab", "lanes", "canvas-file"])
  for (const key of ["src", "org"]) {
    T(`E13-${s}-${key}`, `Property ${key === "src" ? "text" : "list"} field: [[ pick with Enter, then # and a heading (${s})`, async () => {
      const a = await propPick(s, key, ["Abstraction delays tru", { k: "Enter" }]);
      const b = await propPick(s, key, ["ed-target", hash, "Goa", { k: "Enter" }]);
      const wantA = key === "src" ? 'src: "[[z/Abstraction delays trust]]"' : 'org:\n  - "[[z/Abstraction delays trust]]"';
      const wantB = key === "src" ? 'src: "[[_test/ed-target#Goals]]"' : 'org:\n  - "[[_test/ed-target#Goals]]"';
      return [a.includes(wantA) && b.includes(wantB), { a, b }];
    });
  }
T("E14", "Property field: Tab pick, and the alias kept with Insert without alias off", async () => {
  const a = await propPick("tab", "src", ["Abstraction delays tru", { k: "Tab" }]);
  await setPlugin("stripAlias", false);
  const b = await propPick("tab", "src", ["Abstraction delays tru", { k: "Enter" }]);
  await setPlugin("stripAlias", true);
  return [a.includes('src: "[[z/Abstraction delays trust]]"') && b.includes('src: "[[z/Abstraction delays trust|Abstraction delays trust]]"'), { a, b }];
});

// ----- F: dates -----
for (const s of ["tab", "lanes", "canvas-file"])
  T(`F1-${s}`, `Date and date & time fields are ISO text with seconds and a calendar button (${s})`, async () => {
    await ev(`return await E.open(${JSON.stringify(s)}, ${JSON.stringify(DATE_NOTE)})`);
    await sleep(900);
    const r = await ev(`const g=k=>{const e=[...E.cm.dom.ownerDocument.querySelectorAll('.metadata-property[data-property-key="'+k+'"] .metadata-property-value > input:first-child')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]; return e? {type:e.type, value:e.value, ph:e.placeholder, btn: !!e.parentElement.querySelector(".iso-date-picker[role=button][tabindex='0']")} : null}; return {created:g("created"), due:g("due")}`);
    const pass = r.created?.type === "text" && r.created.value === "2026-09-10 09:30:00" && r.created.ph === "YYYY-MM-DD HH:mm:ss" && r.created.btn && r.due?.type === "text" && r.due.value === "2026-11-06" && r.due.btn;
    return [pass, r];
  });
T("F1-bases", "Bases table cells for date and date & time are ISO text", async () => {
  const r = await ev(`await E.file("_test/ed-b1.md","---\\ncreated: 2026-09-10T09:30:00\\ndue: 2026-11-06\\n---\\nx"); await E.file("_test/ed.base", 'filters:\\n  and:\\n    - file.inFolder("_test")\\n    - file.name.startsWith("ed-b")\\nviews:\\n  - type: table\\n    name: T\\n    order:\\n      - file.name\\n      - created\\n      - due\\n'); await E.routeException("_test/ed.base"); let l=app.workspace.getLeavesOfType("bases").find(l=>l.view.file?.path==="_test/ed.base"); if(!l){ l=app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("_test/ed.base")); } app.workspace.setActiveLeaf(l,{focus:true}); E.baseLeaf=l; await E.sleep(1500); return [...l.view.containerEl.querySelectorAll(".bases-td[data-property^='note.'] input:first-child")].map(i=>i.type+":"+i.value)`);
  return [eq(r, ["text:2026-09-10 09:30:00", "text:2026-11-06"]), r];
});
T("F1-sidebar", "The File properties side view uses the same ISO fields", async () => {
  const r = await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(400); app.commands.executeCommandById("properties:open-local"); await E.sleep(1200); const l=app.workspace.getLeavesOfType("file-properties")[0]; if(!l) return "no view"; const v=[...l.view.containerEl.querySelectorAll('.metadata-property[data-property-key="created"] .metadata-property-value > input:first-child, .metadata-property[data-property-key="due"] .metadata-property-value > input:first-child')].map(i=>i.type+":"+i.value); return v`);
  return [eq(r, ["text:2026-09-10 09:30:00", "text:2026-11-06"]), r];
});
for (const s of ["tab", "canvas-file"])
  T(`F3-${s}`, `Typing dates: ISO saved, others outlined and not saved, Escape restores, empty clears, the field shows what is stored (${s})`, async () => {
    await ev(`return await E.open(${JSON.stringify(s)}, ${JSON.stringify(DATE_NOTE)})`);
    await sleep(900);
    const steps = [];
    steps.push(["bad date", await dateType(s, "due", "06/11/2026")]);
    steps.push(["good date", await dateType(s, "due", "2026-11-07")]);
    steps.push(["escape", await dateType(s, "due", "2026-12-01", "Escape")]);
    steps.push(["dt no secs", await dateType(s, "created", "2026-11-07 10:00")]);
    steps.push(["dt with T", await dateType(s, "created", "2026-11-07T11:00:15")]);
    steps.push(["dt bad", await dateType(s, "created", "7 Nov 2026")]);
    steps.push(["clear", await dateType(s, "due", "")]);
    const [bad, good, esc, dt1, dt2, dtbad, clr] = steps.map(x => x[1]);
    const reverted = (x, shown) => x.shown === shown && x.after.invalid !== "true" && !x.after.outline && x.notices.some(n => /isn't a valid date/.test(n) && n.includes(`"${shown}"`));
    const pass =
      bad.st.invalid === "true" && /text-error/.test(bad.st.outline) && bad.fm.includes("due: 2026-11-06") && reverted(bad, "2026-11-06") &&
      good.fm.includes("due: 2026-11-07") && good.shown === "2026-11-07" &&
      esc.fm.includes("due: 2026-11-07") && esc.shown === "2026-11-07" &&
      dt1.fm.includes("created: 2026-11-07T10:00:00") && dt1.shown === "2026-11-07 10:00:00" &&
      dt2.fm.includes("created: 2026-11-07T11:00:15") && dt2.shown === "2026-11-07 11:00:15" &&
      dtbad.st.invalid === "true" && dtbad.fm.includes("created: 2026-11-07T11:00:15") && reverted(dtbad, "2026-11-07 11:00:15") &&
      good.notices.length === 0 && dt1.notices.length === 0 &&
      /due:\s*$/m.test(clr.fm) && clr.shown === "";
    return [pass, Object.fromEntries(steps.map(([k, v]) => [k, { shown: v.shown, typingInvalid: v.st.invalid, after: v.after, notices: v.notices, fm: v.fm.replace(/\n/g, " | ") }]))];
  });
T("F8", "The calendar picker writes ISO (a time without seconds gets :00); Enter on the button opens it", async () => {
  await ev(`return await E.open("tab", ${JSON.stringify(DATE_NOTE)})`);
  await sleep(800);
  const r = await ev(`const el=${dateField("created")}; const p=el.parentElement.querySelector(".iso-date-hidden-picker"); let opened=0; p.showPicker=()=>{opened++}; const b=el.parentElement.querySelector(".iso-date-picker"); b.focus(); b.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); const pv=p.value; p.value="2026-01-02T03:04"; p.dispatchEvent(new Event("change")); await E.sleep(1200); const d=${dateField("due")}; const pd=d.parentElement.querySelector(".iso-date-hidden-picker"); pd.value="2026-03-04"; pd.dispatchEvent(new Event("change")); await E.sleep(1200); return {opened, pickerGot: pv, created: ${dateField("created")}.value, fm: (await app.vault.read(app.vault.getAbstractFileByPath("_test/ed-tab.md"))).split("---")[1].trim()}`);
  return [r.opened === 1 && /^2026-09-10T09:30(:00)?$/.test(r.pickerGot) && r.created === "2026-01-02 03:04:00" && r.fm === "created: 2026-01-02T03:04:00\ndue: 2026-03-04", r];
});
T("F10", "Turning Dates in properties off / on redraws open notes and Bases tabs at once", async () => {
  await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(600); return 1`);
  const look = () => ev(`const n=${dateField("created")}?.type; const l=E.baseLeaf; const b=l? [...l.view.containerEl.querySelectorAll(".bases-td[data-property='note.created'] input:first-child")].map(i=>i.type).join(","):"-"; return n+"/"+b`);
  await ev(`app.workspace.setActiveLeaf(E.baseLeaf,{focus:true}); return 1`);
  await setPlugin("isoDates", false);
  await sleep(1500);
  const off = await look();
  await setPlugin("isoDates", true);
  await sleep(1500);
  const on = await look();
  return [off === "datetime-local/datetime-local" && on === "text/text", { off, on }];
});

// ----- G: settings tab -----
T("G1", "The settings tab lists every setting with its description", async () => {
  await settingsTab("obsidian-editor-defaults");
  const r = await ev(`return [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].map(i=>i.querySelector(".setting-item-name").textContent + (i.querySelector(".checkbox-container.is-enabled")?" [on]":i.querySelector("input[type=text]")?" ["+i.querySelector("input[type=text]").value+"]":" [off]"))`);
  await closeSettings();
  return [r.length === 8 && r.filter(x => / \[on\]$/.test(x)).length === 7 && r.includes("Attachment folder [u]"), r];
});

// ---------- run ----------
await ev(`await E.file("_test/ed-target.md","# Goals\\n\\nfirst para\\n\\nsecond para ^abc\\n"); return 1`);
await ev(`E.errs.length=0; return 1`);
for (const cs of cases) {
  if (filter && !filter.test(cs.id) && !filter.test(cs.title)) continue;
  let pass = false, ev_ = null;
  try {
    [pass, ev_] = await cs.fn();
  } catch (e) {
    ev_ = "ERROR " + (e.message || e).split("\n")[0];
  }
  try { await ev(`if (app.setting.isOpen) app.setting.close(); document.querySelectorAll(".modal-container").forEach(m=>m.querySelector(".modal-close-button")?.click()); return 1`); } catch {}
  results.push({ id: cs.id, title: cs.title, pass, evidence: ev_ });
  console.log(`${pass ? "PASS" : "FAIL"} ${cs.id} ${cs.title}${pass ? "" : "\n     " + JSON.stringify(ev_)}`);
}
const errs = (await ev(`return E.errs`)).filter(e => !/MiniSearch|omnisearch/i.test(e));
console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed; console errors (excluding Omnisearch): ${errs.length}`);
if (errs.length) console.log(errs.join("\n---\n"));
const final = await cfg();
console.log("final config ok:", okCfg(final));
fs.writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify({ date: new Date().toISOString(), results, errs, finalOk: okCfg(final) }, null, 1));
process.exit(0);
