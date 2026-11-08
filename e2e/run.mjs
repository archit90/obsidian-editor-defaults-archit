// The Editor Defaults (Archit) end-to-end catalogue (TEST-CASES.md), against a sandbox Obsidian (e2e/sandbox.sh):
//   node e2e/run.mjs [--filter <id-regex>]      (npm run e2e)
// CDP_PORT: the sandbox's DevTools port (default: cdp.mjs's, sandbox 2). A case that needs another plugin says so
// (`needs`: community plugin ids, or core:<id>) and is skipped without it; E2E_REQUIRE=<id>,<id> turns those skips
// into failures (for runs with the other plugins). A case about life without a plugin (`unless`) is skipped while
// that plugin is loaded. Results go to e2e/results.json; the exit code is 1 when a case fails.
import fs from "node:fs";
import { PATHS, PICK_LINK, PICK_QUERY } from "./fixtures.mjs";
import { DEFAULTS as D, PLUGIN_ID, setup, sleep } from "./lib.mjs";

const c = await setup();
const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
const args = process.argv.slice(2);
const filter = args.includes("--filter") ? new RegExp(args[args.indexOf("--filter") + 1]) : null;
const ev = b => c.ev2(b);
const LANES = ["editor-multiple-lanes"];
const TEMPLATER = ["templater-obsidian"];
const BFV = ["backlinks-full-view"];
const TEMPLATER_NEW = "templater-obsidian:create-new-note-from-template";

// ---------- helpers ----------
const KEYS = {
  "[": [219, "BracketLeft"],
  "]": [221, "BracketRight"],
  ArrowLeft: [37, "ArrowLeft"],
  ArrowRight: [39, "ArrowRight"],
};
async function chord(k, mods) {
  const m = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0);
  const [vk, code] = KEYS[k];
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
}
async function charKey(ch, code, vk, shift) {
  const base = { key: ch, code, modifiers: shift ? 8 : 0, windowsVirtualKeyCode: vk };
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, text: ch, unmodifiedText: ch });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
const hash = () => charKey("#", "Digit3", 51, true);
const caret = () => charKey("^", "Digit6", 54, true);
const cfg = () => ev(`return E.cfg()`);
const notices = () =>
  ev(
    `const docs=new Set([document]); if (app.setting.activeTab?.containerEl) docs.add(app.setting.activeTab.containerEl.doc); return [...docs].flatMap(d=>[...d.querySelectorAll(".notice")].map(n=>n.textContent))`,
  );
const clearNotices = () =>
  ev(
    `const docs=new Set([document]); if (app.setting.activeTab?.containerEl) docs.add(app.setting.activeTab.containerEl.doc); docs.forEach(d=>d.querySelectorAll(".notice").forEach(n=>n.remove())); return 1`,
  );
const setPlugin = (k, v) =>
  ev(
    `${P}.settings[${JSON.stringify(k)}]=${JSON.stringify(v)}; await ${P}.${k === "isoDates" ? "isoDatesChanged" : "saveSettings"}(); return 1`,
  );
const readFile = p =>
  ev(`const f=app.vault.getAbstractFileByPath(${JSON.stringify(p)}); return f? await app.vault.read(f) : null`);
/** Polls the page code `body` until it returns something truthy or `ms` have passed; returns its last value. */
async function waitFor(body, ms = 2500) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await ev(body);
    if (v || Date.now() >= end) return v;
    await sleep(150);
  }
}
/** The open prompt modal's placeholder, or null; with `wait`, waits that long for one to open (with other plugins
 *  enabled, Obsidian can take longer than usual to open it). */
const modal = (wait = 0) =>
  waitFor(
    `const m=document.querySelector(".modal-container .prompt"); return m? (m.querySelector(".prompt-input")?.placeholder||"prompt") : null`,
    wait,
  );
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** A console error from this plugin: its log prefix, or a stack through its code (not just the sandbox's path). */
const isMine = e => /\[editor-defaults\]|plugin:editor-defaults-archit/.test(e);
const WANT_HK = Object.fromEntries(D.hotkeys.map(h => [h.command, h.keys]));
/** The core plugin states to keep with these community plugins loaded (an onlyWith rule needs its plugin). */
const wantCore = loaded =>
  Object.fromEntries(
    D.corePlugins.filter(r => !r.onlyWith || loaded.includes(r.onlyWith.id)).map(r => [r.id, r.enabled]),
  );
const okCfg = x =>
  x.link === D.config.newLinkFormat &&
  x.att === D.attachmentFolder &&
  x.trash === D.config.trashOption &&
  Object.entries(wantCore(x.loaded)).every(([id, on]) => x.core[id] === on) &&
  eq(x.hk, WANT_HK);
const restorePlugin = () =>
  ev(
    `await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(800); return 1`,
  );

async function settingsTab(id) {
  await ev(
    `if(!app.setting.isOpen) app.setting.open(); app.setting.openTabById(${JSON.stringify(id)}); await E.sleep(500); return 1`,
  );
}
const closeSettings = () => ev(`app.setting.close(); return 1`);
const settingItem = name =>
  `[...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.offsetParent && i.querySelector(".setting-item-name")?.textContent===${JSON.stringify(name)})`;

// link picking in the editor: open the surface with `text`, type [[ and run the steps, return the text
async function linkPick(surface, steps, text = "see ") {
  await ev(`return await E.open(${JSON.stringify(surface)}, ${JSON.stringify(text)})`);
  await c.type("[[");
  for (const s of steps) {
    if (typeof s === "function") await s();
    else if (s.k) {
      // a key that takes a suggestion: once the dropdown shows it
      await waitFor(`return E.suggestOpen()`, 2000);
      await c.key(s.k, s.m || {});
    } else await c.type(s);
    await sleep(650);
  }
  await sleep(300);
  const out = await ev(`return E.text()`);
  await c.key("Escape");
  return out;
}
const notePath = s => (s.startsWith("canvas") ? PATHS.card : s === "lanes" ? PATHS.lane : PATHS.tab);
// link picking in a property field
async function propPick(surface, key, steps) {
  await ev(`return await E.open(${JSON.stringify(surface)}, "---\\ned_src: \\ned_org: []\\n---\\nbody")`);
  await sleep(900);
  const r = await ev(
    `const doc=E.cm.dom.ownerDocument; const el=[...doc.querySelectorAll('.metadata-property[data-property-key="${key}"] .metadata-property-value [contenteditable]')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]; if(!el) return "no field"; el.focus(); return "ok"`,
  );
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
  const t = await readFile(notePath(surface));
  return t.split("---")[1].trim();
}
// date fields
const DATE_NOTE = "---\ned_created: 2026-09-10T09:30:00\ned_due: 2026-11-06\n---\nbody";
const dateField = k =>
  `[...E.cm.dom.ownerDocument.querySelectorAll('.metadata-property[data-property-key="${k}"] .metadata-property-value > input:first-child')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]`;
async function dateType(surface, k, text, end = "Enter") {
  await ev(`const el=${dateField(k)}; el.focus(); el.select(); return 1`);
  await c.key("Backspace");
  if (text) await c.type(text);
  await sleep(200);
  const st = await ev(
    `const el=${dateField(k)}; return {v:el.value, invalid:el.getAttribute("aria-invalid"), outline:el.style.outline}`,
  );
  await clearNotices();
  await c.key(end);
  await sleep(1200);
  const fm = (await readFile(notePath(surface))).split("---")[1].trim();
  const after = await ev(
    `const el=${dateField(k)}; return {v:el?.value, invalid:el?.getAttribute("aria-invalid"), outline:el?.style.outline}`,
  );
  return { st, fm, shown: after.v, after, notices: await notices() };
}
const BASE = `${PATHS.tabFolder}ed.base`;
const BASE_ROW = `${PATHS.tabFolder}b1.md`;
/** A Bases table of one note with both date properties, open in a tab (E.baseLeaf). */
const openBase = () =>
  ev(
    `await E.file(${JSON.stringify(BASE_ROW)},"---\\ned_created: 2026-09-10T09:30:00\\ned_due: 2026-11-06\\n---\\nx"); const f=await E.file(${JSON.stringify(BASE)}, 'filters:\\n  and:\\n    - file.inFolder("_test/ed-tab")\\n    - file.name.startsWith("b1")\\nviews:\\n  - type: table\\n    name: T\\n    order:\\n      - file.name\\n      - ed_created\\n      - ed_due\\n'); let l=app.workspace.getLeavesOfType("bases").find(l=>l.view.file?.path===${JSON.stringify(BASE)}); if(!l){ l=app.workspace.getLeaf("tab"); await l.openFile(f); } app.workspace.setActiveLeaf(l,{focus:true}); E.baseLeaf=l; await E.sleep(1500); return 1`,
  );
const baseCells = (prop = "") =>
  `[...E.baseLeaf.view.containerEl.querySelectorAll(".bases-td[data-property^='note.${prop}'] input:first-child")].map(i=>i.type+":"+i.value)`;

// ---------- the cases ----------
const cases = [];
/** A case; `needs`: plugins it requires (else skipped), `unless`: plugins whose absence it is about (else skipped). */
const T = (id, title, fn, { needs = [], unless = [] } = {}) => cases.push({ id, title, fn, needs, unless });
const SURFACE_NEEDS = { tab: [], "canvas-text": [], "canvas-file": [], lanes: LANES };

T("A2", "Disable + enable the plugin re-applies drifted defaults", async () => {
  await ev(
    `await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); app.vault.setConfig("newLinkFormat","shortest"); app.vault.setConfig("trashOption","system"); app.vault.setConfig("attachmentFolderPath","./"); await app.internalPlugins.plugins["zk-prefixer"].enable(true); await app.internalPlugins.plugins.bases.disable(true); app.hotkeyManager.setHotkeys("app:go-back",[]); app.hotkeyManager.removeHotkeys("templater-obsidian:insert-templater"); await app.hotkeyManager.save(); await E.sleep(800); return 1`,
  );
  const drifted = await cfg();
  await ev(`await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(1500); return 1`);
  const after = await cfg();
  return [
    okCfg(after) && !okCfg(drifted),
    { drifted: [drifted.link, drifted.trash, drifted.att, drifted.core], after },
  ];
});
T("A3", "Applying when everything is already right writes nothing (idempotent)", async () => {
  const r = await ev(
    `const fs=require("fs"), base=app.vault.adapter.basePath+"/.obsidian/"; const m=()=>["app.json","hotkeys.json","core-plugins.json"].map(f=>fs.existsSync(base+f)? fs.statSync(base+f).mtimeMs : null); await E.sleep(1200); const a=m(); const out=await ${P}.applyDefaults(); await E.sleep(1500); const b=m(); return {a,b,out}`,
  );
  return [eq(r.a, r.b) && r.a.some(t => t !== null) && r.out.length === 0, r];
});
T("A4", "Disabling the plugin removes every patch and stops enforcing; enabling brings them back", async () => {
  const coreLinkSuggest = `app.workspace.editorSuggest.suggests.find(s=>s.suggestManager)`;
  await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(700); return 1`);
  await ev(`await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(600); return 1`);
  const off = await ev(
    `return {suggestOwn: Object.hasOwn(${coreLinkSuggest},"selectSuggestion"), hmSave: Object.hasOwn(app.hotkeyManager,"save"), due: ${dateField("ed_due")}?.type}`,
  );
  const linkOff = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(800); return 1`);
  const linkCfgOff = (await cfg()).link;
  await ev(`await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(1500); return 1`);
  const on = await ev(
    `await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(700); return {suggestOwn: Object.hasOwn(${coreLinkSuggest},"selectSuggestion"), hmSave: Object.hasOwn(app.hotkeyManager,"save"), due: ${dateField("ed_due")}?.type, link: app.vault.getConfig("newLinkFormat")}`,
  );
  const linkOn = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  const pass =
    !off.suggestOwn &&
    !off.hmSave &&
    off.due === "date" &&
    linkOff.includes(`|Ed pick target]]`) &&
    linkCfgOff === "shortest" &&
    on.suggestOwn &&
    on.hmSave &&
    on.due === "text" &&
    on.link === "absolute" &&
    linkOn === `see [[${PICK_LINK}]]`;
  return [pass, { off, linkOff, linkCfgOff, on, linkOn }];
});
T(
  "A6",
  "Templater disabled: no errors, hotkeys still written by id; Alt+N back once Templater is on",
  async () => {
    await ev(
      `E.errs.length=0; await app.plugins.disablePlugin("templater-obsidian"); app.hotkeyManager.removeHotkeys(${JSON.stringify(TEMPLATER_NEW)}); await app.hotkeyManager.save(); await E.sleep(1000); return 1`,
    );
    const hk = (await cfg()).hk[TEMPLATER_NEW];
    await ev(`await E.open("tab","abc"); return 1`);
    await c.key("n", { alt: true });
    await sleep(700);
    const m1 = await modal();
    if (m1) await c.key("Escape");
    await ev(
      `await app.plugins.enablePlugin("templater-obsidian"); await E.sleep(1500); await E.open("tab","abc"); return 1`,
    );
    await c.key("n", { alt: true });
    const m2 = await modal(2500);
    if (m2) await c.key("Escape");
    const errs = (await ev(`return E.errs`)).filter(isMine);
    return [eq(hk, WANT_HK[TEMPLATER_NEW]) && !m1 && !!m2 && errs.length === 0, { hk, m1, m2, errs }];
  },
  { needs: TEMPLATER },
);
T(
  "A6b",
  "Templater not installed: its hotkeys are saved by command id; Alt+N runs another command given it, with no clash warning",
  async () => {
    await clearNotices();
    const file = await ev(
      `app.hotkeyManager.setHotkeys("editor:toggle-bold",[{modifiers:["Alt"],key:"N"}]); await app.hotkeyManager.save(); await E.sleep(1200); return JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/hotkeys.json","utf8"))`,
    );
    const warned = (await notices()).filter(n => /Alt\+N/.test(n));
    await ev(`await E.open("tab","abc"); E.editor.setSelection({line:0,ch:0},{line:0,ch:3}); return 1`);
    await c.key("n", { alt: true });
    await sleep(700);
    const text = await ev(`return E.text()`);
    await ev(`app.hotkeyManager.removeHotkeys("editor:toggle-bold"); await app.hotkeyManager.save(); return 1`);
    const errs = (await ev(`return E.errs`)).filter(isMine);
    const templater = Object.fromEntries(
      Object.keys(WANT_HK)
        .filter(id => id.startsWith("templater-obsidian:"))
        .map(id => [id, file[id]]),
    );
    return [
      eq(templater, Object.fromEntries(Object.keys(templater).map(id => [id, WANT_HK[id]]))) &&
        warned.length === 0 &&
        text === "**abc**" &&
        errs.length === 0,
      { templater, warned, text, errs },
    ];
  },
  { unless: TEMPLATER },
);
T("A7", "Settings saved partly (old data.json) are merged with the defaults", async () => {
  const r = await ev(
    `const p=${P}; const d=await p.loadData(); await p.saveData({forceTrash:false}); await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(800); const s={...${P}.settings}; await ${P}.saveData(d ?? {}); await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(800); return s`,
  );
  return [
    r.forceTrash === false &&
      r.forceRootPaths === true &&
      r.isoDates === true &&
      r.attachmentFolder === D.attachmentFolder,
    r,
  ];
});
T("A8", "The plugin's settings changed on disk (another device, through sync) are used at once", async () => {
  const r = await ev(
    `const fs=require("fs"), file=app.vault.adapter.basePath+"/"+${P}.manifest.dir+"/data.json"; const before=fs.existsSync(file)? fs.readFileSync(file,"utf8") : null; const cur={...${P}.settings}; fs.writeFileSync(file, JSON.stringify({...cur, forceTrash:false}, null, 2)); for (let i=0; i<40 && ${P}.settings.forceTrash; i++) await E.sleep(250); const off=${P}.settings.forceTrash; app.vault.setConfig("trashOption","system"); await E.sleep(1000); const kept=app.vault.getConfig("trashOption"); fs.writeFileSync(file, before ?? JSON.stringify({...cur, forceTrash:true}, null, 2)); for (let i=0; i<40 && !${P}.settings.forceTrash; i++) await E.sleep(250); await E.sleep(800); return {off, kept, on: ${P}.settings.forceTrash, trash: app.vault.getConfig("trashOption")}`,
  );
  return [r.off === false && r.kept === "system" && r.on === true && r.trash === "local", r];
});
T("A9", "A change that comes in while the defaults are being applied is put back too, not dropped", async () => {
  await clearNotices();
  // Unique note creator turned on is turned off again; while that runs, something sets Deleted files
  const r = await ev(
    `const zk=app.internalPlugins.plugins["zk-prefixer"]; zk.disable=async function(...a){ app.vault.setConfig("trashOption","system"); delete zk.disable; return zk.disable(...a); }; await zk.enable(true); await E.sleep(2500); if (Object.hasOwn(zk,"disable")) delete zk.disable; return {zk: zk.enabled, trash: app.vault.getConfig("trashOption")}`,
  );
  return [r.zk === false && r.trash === "local", r];
});

// ----- B: vault settings -----
T(
  "B2",
  "Settings → Files and links: changing New link format is put back, with a notice, and the dropdown shows it",
  async () => {
    await settingsTab("file");
    await clearNotices();
    await ev(
      `const s=${settingItem("New link format")}.querySelector("select"); s.value="shortest"; s.dispatchEvent(new Event("change")); return 1`,
    );
    await sleep(1000);
    const r = {
      link: (await cfg()).link,
      dropdown: await ev(`return ${settingItem("New link format")}.querySelector("select").value`),
      notices: await notices(),
    };
    return [
      r.link === "absolute" &&
        r.dropdown === "absolute" &&
        r.notices.some(n => /New link format/.test(n) && /New links use path from vault root/.test(n)),
      r,
    ];
  },
);
T("B9", "Settings → Files and links: changing the attachment location is put back", async () => {
  await settingsTab("file");
  await clearNotices();
  await ev(
    `const s=${settingItem("Default location for new attachments")}.querySelector("select"); s.value="current"; s.dispatchEvent(new Event("change")); return 1`,
  );
  await sleep(1000);
  const r = {
    att: (await cfg()).att,
    dropdown: await ev(`return ${settingItem("Default location for new attachments")}.querySelector("select").value`),
    notices: await notices(),
  };
  return [
    r.att === D.attachmentFolder && r.dropdown === "folder" && r.notices.some(n => /Attachment folder/.test(n)),
    r,
  ];
});
T("B11", "Settings → Files and links: changing Deleted files is put back", async () => {
  await settingsTab("file");
  await clearNotices();
  await ev(
    `const s=${settingItem("Deleted files")}.querySelector("select"); s.value="none"; s.dispatchEvent(new Event("change")); return 1`,
  );
  await sleep(1000);
  const r = {
    trash: (await cfg()).trash,
    dropdown: await ev(`return ${settingItem("Deleted files")}.querySelector("select").value`),
    notices: await notices(),
  };
  await closeSettings();
  return [r.trash === "local" && r.dropdown === "local" && r.notices.some(n => /Deleted files/.test(n)), r];
});
T("B3", "app.json changed on disk (sync) is put back and written back", async () => {
  await clearNotices();
  await sleep(3000);
  // Obsidian's file watcher can miss a write (it reports none for this file then, so there's nothing for the plugin
  // to put back): wait for its raw event on app.json, and write again if none came
  await ev(
    `window.__b3raw = 0; E.b3ref = app.vault.on("raw", p => { if (p === app.vault.configDir + "/app.json") window.__b3raw++; }); return 1`,
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    await ev(
      `const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/app.json"; const a=JSON.parse(fs.readFileSync(f,"utf8")); a.newLinkFormat="relative"; a.attachmentFolderPath="att"; fs.writeFileSync(f, JSON.stringify(a,null,2)); return 1`,
    );
    if (await waitFor(`return window.__b3raw > 0`, 4000)) break;
  }
  await ev(`app.vault.offref(E.b3ref); return 1`);
  await sleep(3000);
  const r = {
    cfg: await cfg(),
    disk: await ev(
      `const a=JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/app.json","utf8")); return [a.newLinkFormat, a.attachmentFolderPath]`,
    ),
    notices: await notices(),
  };
  return [
    r.cfg.link === "absolute" &&
      r.cfg.att === D.attachmentFolder &&
      eq(r.disk, ["absolute", D.attachmentFolder]) &&
      r.notices.length > 0,
    { link: r.cfg.link, att: r.cfg.att, disk: r.disk, notices: r.notices },
  ];
});
T(
  "B4",
  "With the toggle off, a change in Obsidian's settings stays (no notice); turning it on applies it at once",
  async () => {
    await setPlugin("forceRootPaths", false);
    await clearNotices();
    await ev(`app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(900); return 1`);
    const off = { link: (await cfg()).link, notices: await notices() };
    await setPlugin("forceRootPaths", true);
    const on = (await cfg()).link;
    return [off.link === "shortest" && off.notices.length === 0 && on === "absolute", { off, on }];
  },
);
T("B6", "New attachments go to the attachment folder", async () => {
  const p = await ev(
    `return await app.fileManager.getAvailablePathForAttachment("ed-test.png", ${JSON.stringify(PATHS.tab)})`,
  );
  return [p === `${D.attachmentFolder}/ed-test.png`, p];
});
T("B7", "Attachment folder field: typing doesn't write app.json; leaving the field does", async () => {
  await settingsTab(PLUGIN_ID);
  const field = `${settingItem("Attachment folder")}.querySelector("input")`;
  // the settings window is another CDP target: type by input events, one per character, as typing does
  await ev(
    `const i=${field}; i.focus(); i.value=""; i.dispatchEvent(new Event("input")); for (const ch of "assets") { i.value+=ch; i.dispatchEvent(new Event("input")); await E.sleep(30); } return 1`,
  );
  await sleep(500);
  const typing = (await cfg()).att;
  await ev(`${field}.blur(); ${field}.dispatchEvent(new FocusEvent("blur")); await E.sleep(600); return 1`);
  const blurred = (await cfg()).att;
  await ev(
    `const i=${field}; i.focus(); i.value=${JSON.stringify(D.attachmentFolder)}; i.dispatchEvent(new Event("input")); i.blur(); i.dispatchEvent(new FocusEvent("blur")); await E.sleep(600); return 1`,
  );
  const back = (await cfg()).att;
  await closeSettings();
  return [
    typing === D.attachmentFolder && blurred === "assets" && back === D.attachmentFolder,
    { typing, blurred, back },
  ];
});
T("B7b", "A half-typed attachment folder isn't applied by a put-back that happens while typing", async () => {
  await settingsTab(PLUGIN_ID);
  const field = `${settingItem("Attachment folder")}.querySelector("input")`;
  await ev(`const i=${field}; i.focus(); i.value="hal"; i.dispatchEvent(new Event("input")); return 1`);
  // something else is put back meanwhile
  await ev(`app.vault.setConfig("trashOption","system"); await E.sleep(1200); return 1`);
  const during = await cfg();
  await ev(
    `const i=${field}; i.value=${JSON.stringify(D.attachmentFolder)}; i.dispatchEvent(new Event("input")); i.blur(); i.dispatchEvent(new FocusEvent("blur")); await E.sleep(600); return 1`,
  );
  const after = { att: (await cfg()).att, setting: await ev(`return ${P}.settings.attachmentFolder`) };
  await closeSettings();
  return [
    during.att === D.attachmentFolder &&
      during.trash === "local" &&
      after.att === D.attachmentFolder &&
      after.setting === D.attachmentFolder,
    { during: { att: during.att, trash: during.trash }, after },
  ];
});
T("B8", "An empty attachment folder field enforces nothing", async () => {
  await ev(
    `${P}.settings.attachmentFolder="  "; await ${P}.saveSettings(); app.vault.setConfig("attachmentFolderPath","./"); await E.sleep(900); return 1`,
  );
  const r = (await cfg()).att;
  await ev(`${P}.settings.attachmentFolder=${JSON.stringify(D.attachmentFolder)}; await ${P}.saveSettings(); return 1`);
  const back = (await cfg()).att;
  return [r === "./" && back === D.attachmentFolder, { r, back }];
});
T("B10", "Deleting a note moves it to .trash", async () => {
  const r = await ev(
    `const fs=require("fs"), t=app.vault.adapter.basePath+"/.trash/del.md"; if (fs.existsSync(t)) fs.rmSync(t); const p=${JSON.stringify(`${PATHS.tabFolder}del.md`)}; const f=await E.file(p,"x"); await E.sleep(400); await app.fileManager.trashFile(f); await E.sleep(500); return {inVault: !!app.vault.getAbstractFileByPath(p), inTrash: fs.existsSync(t)}`,
  );
  return [!r.inVault && r.inTrash, r];
});

// ----- C: core plugins -----
const corePlugin = id => `app.internalPlugins.plugins[${JSON.stringify(id)}]`;
const isCore = id => ev(`return ${corePlugin(id)}.enabled`);
/** Turns a core plugin on or off and gives a check time to pass (for states nothing enforces just then). */
const setCore = (id, on) =>
  ev(`await ${corePlugin(id)}.${on ? "enable" : "disable"}(true); await E.sleep(700); return 1`);
/**
 * Core plugin `id` switched on (by its toggle in Settings → Core plugins, or otherwise) is switched off again, with
 * a notice, while the community plugin that replaces it is loaded: the real one, or simulated (Editor Defaults only
 * checks that it's loaded). It starts off; with a simulated partner, the state from before is put back afterwards.
 */
const replacedPutBack =
  (id, name, partner, { simulated, viaToggle }) =>
  async () => {
    const was = await isCore(id);
    if (simulated) await ev(`E.simulate(${JSON.stringify(partner)}); return 1`);
    try {
      if (was) await setCore(id, false);
      await clearNotices();
      if (viaToggle) {
        await settingsTab("plugins");
        await clearNotices();
        await ev(`${settingItem(name)}.querySelector(".checkbox-container").click(); return 1`);
        await sleep(150);
      } else await ev(`await ${corePlugin(id)}.enable(true); return 1`);
      const mid = await isCore(id);
      await sleep(1100);
      const r = { mid, on: await isCore(id), notices: await notices() };
      if (viaToggle)
        r.toggle = await ev(
          `return ${settingItem(name)}.querySelector(".checkbox-container").classList.contains("is-enabled")`,
        );
      return [
        r.mid === true && r.on === false && r.toggle !== true && r.notices.some(n => n.includes(`${name} off`)),
        r,
      ];
    } finally {
      if (viaToggle) await closeSettings();
      if (simulated) {
        await ev(`E.unsimulate(${JSON.stringify(partner)}); return 1`);
        if (was) await setCore(id, true);
      }
    }
  };
/** Without the community plugin that replaces it, core plugin `id` is left alone: switched on, it stays on. */
const replacedLeftAlone = (id, name) => async () => {
  const was = await isCore(id);
  try {
    if (was) await setCore(id, false);
    await clearNotices();
    await setCore(id, true);
    await sleep(800);
    const r = { on: await isCore(id), notices: await notices() };
    return [r.on === true && !r.notices.some(n => n.includes(name)), r];
  } finally {
    if (!was) await setCore(id, false);
  }
};
T(
  "C2",
  "Settings → Core plugins: Backlinks switched on is switched off again while Backlinks Full View is enabled, with a notice; the toggle shows it",
  replacedPutBack("backlink", "Backlinks", "backlinks-full-view", { simulated: false, viaToggle: true }),
  { needs: BFV },
);
T(
  "C2s",
  "The same with Backlinks Full View simulated (Editor Defaults only checks that it's loaded)",
  replacedPutBack("backlink", "Backlinks", "backlinks-full-view", { simulated: true, viaToggle: true }),
  { unless: BFV },
);
T(
  "C2n",
  "Without Backlinks Full View, core Backlinks is left alone: switched on, it stays on, no notice",
  replacedLeftAlone("backlink", "Backlinks"),
  { unless: BFV },
);
T("C3", "Settings → Core plugins: Bases off is switched on again; Unique note creator on is switched off", async () => {
  await settingsTab("plugins");
  await clearNotices();
  for (const name of ["Bases", "Unique note creator"]) {
    await ev(`${settingItem(name)}.querySelector(".checkbox-container").click(); return 1`);
    await sleep(100);
  }
  await sleep(1200);
  const r = { core: (await cfg()).core, notices: await notices() };
  await closeSettings();
  return [r.core.bases === true && r.core["zk-prefixer"] === false && r.notices.length > 0, r];
});
T(
  "C3t",
  "Core Templates switched on is switched off again while Templater is enabled",
  replacedPutBack("templates", "Templates", "templater-obsidian", { simulated: false, viaToggle: false }),
  { needs: TEMPLATER },
);
T(
  "C3ts",
  "The same with Templater simulated",
  replacedPutBack("templates", "Templates", "templater-obsidian", { simulated: true, viaToggle: false }),
  { unless: TEMPLATER },
);
T(
  "C3n",
  "Without Templater, core Templates is left alone: switched on, it stays on, no notice",
  replacedLeftAlone("templates", "Templates"),
  { unless: TEMPLATER },
);
T("C4", "With Enforce core plugins off the user's choice stays; other core plugins are never touched", async () => {
  const daily = await ev(`return app.internalPlugins.plugins["daily-notes"].enabled`);
  await setPlugin("forceCorePlugins", false);
  await clearNotices();
  await ev(
    `await app.internalPlugins.plugins["zk-prefixer"].enable(true); await app.internalPlugins.plugins["daily-notes"].enable(true); await E.sleep(900); return 1`,
  );
  const off = { zk: (await cfg()).core["zk-prefixer"], notices: await notices() };
  await setPlugin("forceCorePlugins", true);
  await sleep(500);
  const on = {
    zk: (await cfg()).core["zk-prefixer"],
    daily: await ev(`return app.internalPlugins.plugins["daily-notes"].enabled`),
  };
  if (!daily) await ev(`await app.internalPlugins.plugins["daily-notes"].disable(true); return 1`);
  return [
    off.zk === true && off.notices.length === 0 && on.zk === false && on.daily === true,
    { off, on, dailyBefore: daily },
  ];
});

// ----- D: hotkeys -----
T("D1", "Exactly the listed hotkeys, and an explicit [] for the insert template modal", async () => {
  const r = await ev(
    `return JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/hotkeys.json","utf8"))`,
  );
  const pick = Object.fromEntries(Object.keys(WANT_HK).map(k => [k, r[k]]));
  return [eq(pick, WANT_HK), pick];
});
for (const s of ["tab", "lanes", "canvas-text", "canvas-file"])
  T(
    `D2-${s}`,
    `Alt+N opens Templater's create-from-template picker (${s}); Alt+E opens nothing`,
    async () => {
      await ev(`return await E.open(${JSON.stringify(s)}, "abc")`);
      await sleep(300);
      await c.key("n", { alt: true });
      const m = await modal(2500);
      if (m) await c.key("Escape");
      await sleep(300);
      await ev(`E.editor.focus(); return 1`);
      await c.key("e", { alt: true });
      await sleep(700);
      const m2 = await modal();
      if (m2) await c.key("Escape");
      return [/template/i.test(m || "") && !m2, { altN: m, altE: m2, text: await ev(`return E.text()`) }];
    },
    { needs: [...TEMPLATER, ...SURFACE_NEEDS[s]] },
  );
T(
  "D2-explorer",
  "Alt+N works with the file explorer focused (no editor)",
  async () => {
    await ev(
      `const l=app.workspace.getLeavesOfType("file-explorer")[0]; app.workspace.setActiveLeaf(l,{focus:true}); l.view.containerEl.querySelector(".nav-files-container")?.focus(); return 1`,
    );
    await c.key("n", { alt: true });
    const m = await modal(2500);
    if (m) await c.key("Escape");
    return [/template/i.test(m || ""), m];
  },
  { needs: TEMPLATER },
);
for (const s of ["tab", "lanes", "canvas-text"])
  T(
    `D3-${s}`,
    `Alt+N, pick the ed-zettel template: a new note from it; the note you were in is unchanged (${s})`,
    async () => {
      await ev(
        `if(!E.created){E.created=[]; app.vault.on("create", f=>E.created.push(f.path)); app.vault.on("rename", f=>E.created.push(f.path));} E.created.length=0; return await E.open(${JSON.stringify(s)}, "abc")`,
      );
      await c.key("n", { alt: true });
      const picker = await modal(2500);
      if (!picker)
        return [
          false,
          {
            noPicker: await ev(
              `const a=document.activeElement; return {active: a?.tagName+"."+[...(a?.classList||[])].join("."), inFrame: a?.tagName==="IFRAME", hk: app.hotkeyManager.getHotkeys("templater-obsidian:create-new-note-from-template"), cmd: !!app.commands.findCommand("templater-obsidian:create-new-note-from-template"), modals: document.querySelectorAll(".modal-container").length}`,
            ),
          },
        ];
      await c.type("ed-zettel");
      await sleep(500);
      await c.key("Enter");
      const made = `${PATHS.newNotes}/`;
      await waitFor(`return E.created.some(p=>p.startsWith(${JSON.stringify(made)}) && /\\/\\d+\\.md$/.test(p))`, 8000);
      await sleep(800);
      const r = await ev(
        `const made=E.created.filter(p=>p.startsWith(${JSON.stringify(made)}) && /\\/\\d+\\.md$/.test(p)); const f=made[0] && app.vault.getAbstractFileByPath(made[0]); const content = f? await app.vault.read(f) : ""; const orig = await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(s.startsWith("canvas") ? PATHS.canvas : notePath(s))})); for (const p of [...new Set(E.created)]) { const g=app.vault.getAbstractFileByPath(p); if (g && (p.startsWith(${JSON.stringify(made)}) || /^Untitled/.test(p))) { for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view.file===g) l.detach(); await app.vault.delete(g); } } return {made, typeZettel: /type: ed-zettel/.test(content), orig: orig.slice(0,40)}`,
      );
      return [r.made.length === 1 && r.typeZettel && (s.startsWith("canvas") || r.orig === "abc"), r];
    },
    { needs: [...TEMPLATER, ...SURFACE_NEEDS[s]] },
  );
T("D5", "Ctrl+[ / Ctrl+] and Ctrl+Alt+←/→ navigate back and forward, also with the cursor in a list item", async () => {
  const [a, b] = [`${PATHS.tabFolder}navA.md`, `${PATHS.tabFolder}navB.md`];
  await ev(
    `await E.file(${JSON.stringify(a)},"- a\\n  - b"); await E.file(${JSON.stringify(b)},"B"); const l=app.workspace.getLeaf("tab"); E.leafA=l; await l.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(a)})); await E.sleep(400); await l.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(b)})); await E.sleep(400); app.workspace.setActiveLeaf(l,{focus:true}); return 1`,
  );
  const cur = () => ev(`return E.leafA.view.file?.path`);
  const seq = [];
  for (const [k, m] of [
    ["[", { ctrl: true }],
    ["]", { ctrl: true }],
    ["ArrowLeft", { ctrl: true, alt: true }],
    ["ArrowRight", { ctrl: true, alt: true }],
  ]) {
    await ev(
      `app.workspace.setActiveLeaf(E.leafA,{focus:true}); E.leafA.view.editor?.focus(); await E.sleep(100); return 1`,
    );
    await chord(k, m);
    await sleep(600);
    seq.push(await cur());
  }
  await ev(
    `await E.leafA.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(a)})); await E.sleep(400); app.workspace.setActiveLeaf(E.leafA,{focus:true}); const ed=E.leafA.view.editor; ed.focus(); ed.setCursor(1,5); await E.sleep(100); return 1`,
  );
  await chord("[", { ctrl: true });
  await sleep(600);
  seq.push(await cur());
  const text = await readFile(a);
  await ev(`E.leafA.detach(); return 1`);
  return [eq(seq, [a, b, a, b, b]) && text === "- a\n  - b", { seq, text }];
});
T("D6", "Settings → Hotkeys: removing Ctrl+[ from Navigate back is put back; the filter stays", async () => {
  await settingsTab("hotkeys");
  await clearNotices();
  const r = await ev(
    `const t=app.setting.activeTab; const inp=t.containerEl.querySelector(".search-input-container input"); inp.value="Navigate back"; inp.dispatchEvent(new Event("input")); await E.sleep(400); const row=()=>[...t.containerEl.querySelectorAll(".setting-item")].find(i=>i.offsetParent && i.querySelector(".setting-item-name")?.textContent==="Navigate back"); const hk=[...row().querySelectorAll(".setting-hotkey")].find(h=>/\\[/.test(h.textContent)); hk.querySelector(".setting-hotkey-icon, .setting-delete-hotkey").click(); await E.sleep(100); const mid=app.hotkeyManager.getHotkeys("app:go-back").length; await E.sleep(1000); return {mid, hk: app.hotkeyManager.getHotkeys("app:go-back"), filter: inp.value, rows: [...t.containerEl.querySelectorAll(".setting-item")].filter(i=>i.offsetParent).length, shown: [...row().querySelectorAll(".setting-hotkey")].map(h=>h.textContent.trim())}`,
  );
  r.notices = await notices();
  return [
    r.mid === 1 &&
      eq(r.hk, WANT_HK["app:go-back"]) &&
      r.filter === "Navigate back" &&
      r.rows === 1 &&
      r.shown.length === 2 &&
      r.notices.some(n => /Navigate back/.test(n)),
    r,
  ];
});
T(
  "D8",
  "Settings → Hotkeys: 'Restore default' on Alt+N's command is put back, named even without Templater",
  async () => {
    await clearNotices();
    await ev(
      `app.hotkeyManager.removeHotkeys(${JSON.stringify(TEMPLATER_NEW)}); await app.hotkeyManager.save(); await E.sleep(1000); return 1`,
    );
    const r = { hk: (await cfg()).hk[TEMPLATER_NEW], notices: await notices() };
    await closeSettings();
    return [
      eq(r.hk, WANT_HK[TEMPLATER_NEW]) && r.notices.some(n => n.includes('"Templater: Create new note from template"')),
      r,
    ];
  },
);
T("D7", "hotkeys.json changed on disk (sync) is put back and written back", async () => {
  await sleep(3000);
  await ev(
    `const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/hotkeys.json"; const h=JSON.parse(fs.readFileSync(f,"utf8")); h["templater-obsidian:insert-templater"]=[{modifiers:["Alt"],key:"E"}]; h["app:go-forward"]=[]; fs.writeFileSync(f, JSON.stringify(h,null,2)); return 1`,
  );
  await sleep(3500);
  const r = await ev(
    `const h=JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/hotkeys.json","utf8")); return {mem: E.cfg().hk, disk: {ins: h["templater-obsidian:insert-templater"], fwd: h["app:go-forward"]}}`,
  );
  return [eq(r.mem, WANT_HK) && eq(r.disk.ins, []) && eq(r.disk.fwd, WANT_HK["app:go-forward"]), r.disk];
});
T("D9", "With Enforce hotkeys off, the user's hotkeys stay; on again, they're set", async () => {
  await setPlugin("forceHotkeys", false);
  await ev(
    `app.hotkeyManager.setHotkeys(${JSON.stringify(TEMPLATER_NEW)},[{modifiers:["Alt"],key:"M"}]); await app.hotkeyManager.save(); await E.sleep(900); return 1`,
  );
  const off = (await cfg()).hk[TEMPLATER_NEW];
  await setPlugin("forceHotkeys", true);
  const on = (await cfg()).hk[TEMPLATER_NEW];
  return [eq(off, [{ modifiers: ["Alt"], key: "M" }]) && eq(on, WANT_HK[TEMPLATER_NEW]), { off, on }];
});
/** Toggle bold given Alt+N: one clash warning, not repeated; Toggle bold keeps it; Alt+N runs `check` (). */
const altNClash = async check => {
  await clearNotices();
  await ev(
    `app.hotkeyManager.setHotkeys("editor:toggle-bold",[{modifiers:["Alt"],key:"N"}]); await app.hotkeyManager.save(); await E.sleep(1000); return 1`,
  );
  const first = await notices();
  await clearNotices();
  // another drift check (any hotkey save) must not warn again
  await ev(
    `app.vault.setConfig("trashOption","system"); await E.sleep(1000); app.hotkeyManager.setHotkeys("editor:toggle-italics",[{modifiers:["Alt"],key:"I"}]); await app.hotkeyManager.save(); await E.sleep(1000); return 1`,
  );
  const second = await notices();
  const kept = await ev(`return app.hotkeyManager.getHotkeys("editor:toggle-bold")`);
  await ev(`await E.open("tab","abc"); E.editor.setSelection({line:0,ch:0},{line:0,ch:3}); return 1`);
  await c.key("n", { alt: true });
  await sleep(800);
  const ran = await check();
  const text = await ev(`return E.text()`);
  const warn = first.filter(n => /Alt\+N/.test(n) && /Toggle bold/.test(n) && /Settings → Hotkeys/.test(n));
  return [
    warn.length === 1 &&
      !second.some(n => /Toggle bold/.test(n)) &&
      eq(kept, [{ modifiers: ["Alt"], key: "N" }]) &&
      !!ran &&
      text === "abc",
    { first, second, kept, ran, text },
  ];
};
const clearClash = () =>
  ev(
    `app.hotkeyManager.removeHotkeys("editor:toggle-bold"); app.hotkeyManager.removeHotkeys("editor:toggle-italics"); await app.hotkeyManager.save(); return 1`,
  );
T(
  "D10",
  "Another command given Alt+N: a warning names it once per session; its hotkey stays; Alt+N still runs the enforced command (Templater's simulated)",
  async () => {
    // Templater's command stands in: a clash needs the enforced command to exist
    await ev(
      `window.__edRuns=0; app.commands.addCommand({id:${JSON.stringify(TEMPLATER_NEW)}, name:"Templater: Create new note from template", callback:()=>{window.__edRuns++;}}); return 1`,
    );
    try {
      return await altNClash(() => ev(`return window.__edRuns === 1`));
    } finally {
      await ev(`app.commands.removeCommand(${JSON.stringify(TEMPLATER_NEW)}); return 1`);
      await clearClash();
    }
  },
  { unless: TEMPLATER },
);
T(
  "D10t",
  "Another command given Alt+N, with Templater: one warning; Alt+N still opens Templater's picker",
  async () => {
    try {
      return await altNClash(async () => {
        const m = await modal(2500);
        if (m) await c.key("Escape");
        return m;
      });
    } finally {
      await clearClash();
    }
  },
  { needs: TEMPLATER },
);
T("D10b", "A clash already in hotkeys.json is warned about at load (Ctrl+[ on another command)", async () => {
  await clearNotices();
  const r = await ev(
    `await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); app.hotkeyManager.setHotkeys("editor:toggle-italics",[{modifiers:["Ctrl"],key:"["}]); await app.hotkeyManager.save(); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(1500); const kept=app.hotkeyManager.getHotkeys("editor:toggle-italics"); app.hotkeyManager.removeHotkeys("editor:toggle-italics"); await app.hotkeyManager.save(); return kept`,
  );
  const n = await notices();
  return [
    n.some(x => /Ctrl\+\[/.test(x) && /Navigate back/.test(x) && /Toggle italic/i.test(x)) &&
      eq(r, [{ modifiers: ["Ctrl"], key: "[" }]),
    { notices: n, kept: r },
  ];
});
T(
  "D11",
  "Something keeps undoing a default: put back at most 5 times in 10 s, then by itself once that window has passed",
  async () => {
    // saving the settings starts the guard afresh (earlier cases put Deleted files back too)
    await ev(`await ${P}.saveSettings(); return 1`);
    const r = await ev(
      `let n=0; const ref=app.vault.on("config-changed", k=>{ if(k==="trashOption" && app.vault.getConfig("trashOption")==="local" && n<20){ n++; setTimeout(()=>app.vault.setConfig("trashOption","system"),10);} }); app.vault.setConfig("trashOption","system"); await E.sleep(5000); app.vault.offref(ref); return {n, v: app.vault.getConfig("trashOption")}`,
    );
    // nothing changes it any more: the check scheduled for the end of the window puts it back
    await sleep(7500);
    const after = (await cfg()).trash;
    return [r.n === 5 && r.v === "system" && after === "local", { fights: r.n, settled: r.v, afterWindow: after }];
  },
);
T(
  "D11b",
  "An endless slow fight (another device through sync): after 10 put-backs in 10 minutes the item is left alone, with one notice",
  async () => {
    await ev(`await ${P}.saveSettings(); return 1`);
    await clearNotices();
    const r = await ev(
      `let n=0; const ref=app.vault.on("config-changed", k=>{ if(k==="trashOption" && app.vault.getConfig("trashOption")==="local"){ n++; setTimeout(()=>app.vault.setConfig("trashOption","system"),10);} }); app.vault.setConfig("trashOption","system"); await E.sleep(25000); app.vault.offref(ref); return {n, v: app.vault.getConfig("trashOption")}`,
    );
    const shown = (await notices()).filter(n => /stopped putting back/.test(n));
    // a change of the plugin's settings enforces it again
    await ev(`await ${P}.saveSettings(); return 1`);
    const back = (await cfg()).trash;
    return [
      r.n === 10 && r.v === "system" && shown.length === 1 && /Deleted files/.test(shown[0]) && back === "local",
      { puts: r.n, settled: r.v, shown, back },
    ];
  },
);

// ----- E: link suggest in the editor -----
for (const s of ["tab", "canvas-text", "canvas-file", "lanes"]) {
  T(
    `E1-${s}`,
    `[[ pick with Enter inserts [[path]] (${s})`,
    async () => {
      const t = await linkPick(s, [PICK_QUERY, { k: "Enter" }]);
      return [t === `see [[${PICK_LINK}]]`, t];
    },
    { needs: SURFACE_NEEDS[s] },
  );
  if (s === "lanes") continue; // one lanes-card smoke test per feature
  T(`E2-${s}`, `[[ pick with Tab inserts [[path]] (${s})`, async () => {
    const t = await linkPick(s, [PICK_QUERY, { k: "Tab" }]);
    return [t === `see [[${PICK_LINK}]]`, t];
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
  const t = await linkPick("tab", ["Edalias", { k: "Enter" }]);
  return [t === "see [[_test/ed-n/Ed person|Edalias]]", t];
});
T("E6", "A heading typed after the note name gets the full path", async () => {
  const t = await linkPick("tab", ["ed-target#Goa", { k: "Enter" }]);
  return [t === "see [[_test/ed-target#Goals]]", t];
});
T("E7", "Relative and shortest link formats (enforcement off): only the alias goes", async () => {
  await ev(
    `${P}.settings.forceRootPaths=false; await ${P}.saveSettings(); app.vault.setConfig("newLinkFormat","relative"); return 1`,
  );
  const rel = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  const relHead = await linkPick("tab", ["ed-target#Goa", { k: "Enter" }]);
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); return 1`);
  const short = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  await setPlugin("forceRootPaths", true);
  return [
    rel === "see [[../ed-z/Ed pick target]]" &&
      relHead === "see [[ed-target#Goals]]" &&
      short === "see [[Ed pick target]]",
    { rel, relHead, short },
  ];
});
T("E9", "Insert without alias off: Obsidian's [[path|name]] stays", async () => {
  await setPlugin("stripAlias", false);
  const t = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  await setPlugin("stripAlias", true);
  return [t === `see [[${PICK_LINK}|Ed pick target]]`, t];
});
T("E10", "Retargeting [[old|my words]] keeps my words", async () => {
  await ev(`await E.open("tab", "see [[old|my words]]"); E.editor.setSelection({line:0,ch:6},{line:0,ch:9}); return 1`);
  await c.type(PICK_QUERY);
  await sleep(800);
  await c.key("Enter");
  await sleep(400);
  const t = await ev(`return E.text()`);
  return [t === `see [[${PICK_LINK}|my words]]`, t];
});
T("E11", "Shift+Enter (keep the typed text) is untouched", async () => {
  const t = await linkPick("tab", [PICK_QUERY, { k: "Enter", m: { shift: true } }]);
  return [t === `see [[${PICK_QUERY}]]`, t];
});
T("E12", "Clicking a suggestion with the mouse inserts [[path]]", async () => {
  const t = await linkPick("tab", [
    PICK_QUERY,
    async () => {
      const r = await ev(
        `const el=document.querySelector(".suggestion-container .suggestion-item.is-selected") || document.querySelector(".suggestion-container .suggestion-item"); const b=el.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2}`,
      );
      await c.click(r.x, r.y);
    },
  ]);
  return [t === `see [[${PICK_LINK}]]`, t];
});
T("E15", "An ![[ embed pick inserts ![[path]]", async () => {
  const t = await linkPick("tab", [PICK_QUERY, { k: "Enter" }], "see !");
  return [t === `see ![[${PICK_LINK}]]`, t];
});
T(
  "E16",
  "In a table, a pick in a Live Preview cell and in a source-mode row gives [[path]] (no alias, no stray \\)",
  async () => {
    const TABLE = "| a | b |\n| --- | --- |\n| x | y |\n";
    const out = {};
    for (const source of [false, true]) {
      await ev(
        `await E.open("tab", ""); await E.view.setState({...E.view.getState(), mode:"source", source:${source}}, {history:false}); await E.sleep(400); E.editor.setValue(${JSON.stringify(TABLE)}); await E.sleep(300); E.editor.focus(); E.editor.setCursor(2,4); await E.sleep(200); return 1`,
      );
      await c.type(`[[${PICK_QUERY}`);
      await sleep(800);
      await c.key("Enter");
      await sleep(600);
      out[source ? "source" : "live"] = (await ev(`return E.editor.getValue()`)).split("\n")[2];
      await c.key("Escape");
    }
    const ok = l => typeof l === "string" && l.includes(`[[${PICK_LINK}]]`) && !l.includes("\\");
    return [ok(out.live) && ok(out.source), out];
  },
);
T(
  "E17",
  "Another plugin's suggester that inserts [[path|name]] keeps its alias: only Obsidian's [[ suggester is changed",
  async () => {
    await ev(
      `const core=app.workspace.editorSuggest.suggests.find(s=>s.suggestManager); const Base=Object.getPrototypeOf(Object.getPrototypeOf(core)).constructor; class Other extends Base { onTrigger(cursor, editor){ const m=/@@(\\w*)$/.exec(editor.getLine(cursor.line).slice(0,cursor.ch)); return m? {start:{line:cursor.line, ch:cursor.ch-m[1].length}, end:cursor, query:m[1]} : null; } getSuggestions(){ return [{file: app.vault.getAbstractFileByPath(${JSON.stringify(PATHS.pick)}), type:"file"}]; } renderSuggestion(v, el){ el.setText(v.file.basename); } selectSuggestion(v){ const x=this.context; x.editor.replaceRange("[["+v.file.path.slice(0,-3)+"|"+v.file.basename+"]]", {line:x.start.line, ch:x.start.ch-2}, x.end); } } E.other=new Other(app); app.workspace.editorSuggest.addSuggest(E.other); return 1`,
    );
    try {
      // Editor Defaults patches when it loads: load it again with the other suggester there
      await restorePlugin();
      await ev(`return await E.open("tab", "see ")`);
      await c.type("@@x");
      await sleep(700);
      const open = await ev(`return app.workspace.editorSuggest.currentSuggest === E.other`);
      await c.key("Enter");
      await sleep(400);
      const t = await ev(`return E.text()`);
      const own = await ev(
        `return {other: Object.hasOwn(E.other,"selectSuggestion"), core: Object.hasOwn(app.workspace.editorSuggest.suggests.find(s=>s.suggestManager),"selectSuggestion")}`,
      );
      return [open && t === `see [[${PICK_LINK}|Ed pick target]]` && !own.other && own.core, { open, t, own }];
    } finally {
      await ev(`app.workspace.editorSuggest.removeSuggest(E.other); E.other=null; return 1`);
    }
  },
);
// ----- E: properties -----
for (const s of ["tab", "canvas-file", "lanes"])
  for (const key of ["ed_src", "ed_org"]) {
    if (s === "lanes" && key === "ed_org") continue; // one lanes-card smoke test
    T(
      `E13-${s}-${key === "ed_src" ? "src" : "org"}`,
      `Property ${key === "ed_src" ? "text" : "list"} field: [[ pick with Enter, then # and a heading (${s})`,
      async () => {
        const a = await propPick(s, key, [PICK_QUERY, { k: "Enter" }]);
        const b = await propPick(s, key, ["ed-target", hash, "Goa", { k: "Enter" }]);
        const wantA = key === "ed_src" ? `ed_src: "[[${PICK_LINK}]]"` : `ed_org:\n  - "[[${PICK_LINK}]]"`;
        const wantB =
          key === "ed_src" ? 'ed_src: "[[_test/ed-target#Goals]]"' : 'ed_org:\n  - "[[_test/ed-target#Goals]]"';
        return [a.includes(wantA) && b.includes(wantB), { a, b }];
      },
      { needs: SURFACE_NEEDS[s] },
    );
  }
T("E14", "Property field: Tab pick, and the alias kept with Insert without alias off", async () => {
  const a = await propPick("tab", "ed_src", [PICK_QUERY, { k: "Tab" }]);
  await setPlugin("stripAlias", false);
  const b = await propPick("tab", "ed_src", [PICK_QUERY, { k: "Enter" }]);
  await setPlugin("stripAlias", true);
  return [
    a.includes(`ed_src: "[[${PICK_LINK}]]"`) && b.includes(`ed_src: "[[${PICK_LINK}|Ed pick target]]"`),
    { a, b },
  ];
});

// ----- F: dates -----
for (const s of ["tab", "canvas-file", "lanes"])
  T(
    `F1-${s}`,
    `Date and date & time fields are ISO text with seconds and a calendar button (${s})`,
    async () => {
      await ev(`return await E.open(${JSON.stringify(s)}, ${JSON.stringify(DATE_NOTE)})`);
      await sleep(900);
      const r = await ev(
        `const g=k=>{const e=[...E.cm.dom.ownerDocument.querySelectorAll('.metadata-property[data-property-key="'+k+'"] .metadata-property-value > input:first-child')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]; return e? {type:e.type, value:e.value, ph:e.placeholder, btn: !!e.parentElement.querySelector(".iso-date-picker[role=button][tabindex='0']"), host: getComputedStyle(e.parentElement).position} : null}; return {created:g("ed_created"), due:g("ed_due")}`,
      );
      const pass =
        r.created?.type === "text" &&
        r.created.value === "2026-09-10 09:30:00" &&
        r.created.ph === "YYYY-MM-DD HH:mm:ss" &&
        r.created.btn &&
        r.created.host === "relative" &&
        r.due?.type === "text" &&
        r.due.value === "2026-11-06" &&
        r.due.btn;
      return [pass, r];
    },
    { needs: SURFACE_NEEDS[s] },
  );
T("F1-bases", "Bases table cells for date and date & time are ISO text", async () => {
  await openBase();
  const r = await ev(`return ${baseCells()}`);
  return [eq(r, ["text:2026-09-10 09:30:00", "text:2026-11-06"]), r];
});
T("F1-sidebar", "The File properties side view uses the same ISO fields", async () => {
  const r = await ev(
    `await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(400); app.commands.executeCommandById("properties:open-local"); await E.sleep(1200); const l=app.workspace.getLeavesOfType("file-properties")[0]; if(!l) return "no view"; return [...l.view.containerEl.querySelectorAll('.metadata-property[data-property-key="ed_created"] .metadata-property-value > input:first-child, .metadata-property[data-property-key="ed_due"] .metadata-property-value > input:first-child')].map(i=>i.type+":"+i.value)`,
  );
  return [eq(r, ["text:2026-09-10 09:30:00", "text:2026-11-06"]), r];
});
for (const s of ["tab", "canvas-file"])
  T(
    `F3-${s}`,
    `Typing dates: ISO saved, others outlined and not saved, Escape restores, empty clears, the field shows what is stored (${s})`,
    async () => {
      await ev(`return await E.open(${JSON.stringify(s)}, ${JSON.stringify(DATE_NOTE)})`);
      await sleep(900);
      const steps = [];
      steps.push(["bad date", await dateType(s, "ed_due", "06/11/2026")]);
      steps.push(["good date", await dateType(s, "ed_due", "2026-11-07")]);
      steps.push(["escape", await dateType(s, "ed_due", "2026-12-01", "Escape")]);
      steps.push(["dt no secs", await dateType(s, "ed_created", "2026-11-07 10:00")]);
      steps.push(["dt with T", await dateType(s, "ed_created", "2026-11-07T11:00:15")]);
      steps.push(["dt bad", await dateType(s, "ed_created", "7 Nov 2026")]);
      steps.push(["clear", await dateType(s, "ed_due", "")]);
      const [bad, good, esc, dt1, dt2, dtbad, clr] = steps.map(x => x[1]);
      const reverted = (x, shown) =>
        x.shown === shown &&
        x.after.invalid !== "true" &&
        !x.after.outline &&
        x.notices.some(n => /isn't a valid date/.test(n) && n.includes(`"${shown}"`));
      const pass =
        bad.st.invalid === "true" &&
        /text-error/.test(bad.st.outline) &&
        bad.fm.includes("ed_due: 2026-11-06") &&
        reverted(bad, "2026-11-06") &&
        good.fm.includes("ed_due: 2026-11-07") &&
        good.shown === "2026-11-07" &&
        esc.fm.includes("ed_due: 2026-11-07") &&
        esc.shown === "2026-11-07" &&
        dt1.fm.includes("ed_created: 2026-11-07T10:00:00") &&
        dt1.shown === "2026-11-07 10:00:00" &&
        dt2.fm.includes("ed_created: 2026-11-07T11:00:15") &&
        dt2.shown === "2026-11-07 11:00:15" &&
        dtbad.st.invalid === "true" &&
        dtbad.fm.includes("ed_created: 2026-11-07T11:00:15") &&
        reverted(dtbad, "2026-11-07 11:00:15") &&
        good.notices.length === 0 &&
        dt1.notices.length === 0 &&
        /ed_due:\s*$/m.test(clr.fm) &&
        clr.shown === "";
      return [
        pass,
        Object.fromEntries(
          steps.map(([k, v]) => [
            k,
            {
              shown: v.shown,
              typingInvalid: v.st.invalid,
              after: v.after,
              notices: v.notices,
              fm: v.fm.replace(/\n/g, " | "),
            },
          ]),
        ),
      ];
    },
  );
T("F8", "The calendar picker writes ISO (a time without seconds gets :00); Enter on the button opens it", async () => {
  await ev(`return await E.open("tab", ${JSON.stringify(DATE_NOTE)})`);
  await sleep(800);
  const r = await ev(
    `const el=${dateField("ed_created")}; const p=el.parentElement.querySelector(".iso-date-hidden-picker"); let opened=0; p.showPicker=()=>{opened++}; const b=el.parentElement.querySelector(".iso-date-picker"); b.focus(); b.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true})); const pv=p.value; p.value="2026-01-02T03:04"; p.dispatchEvent(new Event("change")); await E.sleep(1200); const d=${dateField("ed_due")}; const pd=d.parentElement.querySelector(".iso-date-hidden-picker"); pd.value="2026-03-04"; pd.dispatchEvent(new Event("change")); await E.sleep(1200); return {opened, pickerGot: pv, created: ${dateField("ed_created")}.value, fm: (await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(PATHS.tab)}))).split("---")[1].trim()}`,
  );
  return [
    r.opened === 1 &&
      /^2026-09-10T09:30(:00)?$/.test(r.pickerGot) &&
      r.created === "2026-01-02 03:04:00" &&
      r.fm === "ed_created: 2026-01-02T03:04:00\ned_due: 2026-03-04",
    r,
  ];
});
T("F10", "Turning Dates in properties off / on redraws open notes and Bases tabs at once", async () => {
  await openBase();
  await ev(`await E.open("tab", ${JSON.stringify(DATE_NOTE)}); await E.sleep(600); return 1`);
  const look = () =>
    ev(
      `const n=${dateField("ed_created")}?.type; const b=[...E.baseLeaf.view.containerEl.querySelectorAll(".bases-td[data-property='note.ed_created'] input:first-child")].map(i=>i.type).join(","); return n+"/"+b`,
    );
  await ev(`app.workspace.setActiveLeaf(E.baseLeaf,{focus:true}); return 1`);
  await setPlugin("isoDates", false);
  await sleep(1500);
  const off = await look();
  await setPlugin("isoDates", true);
  await sleep(1500);
  const on = await look();
  return [off === "datetime-local/datetime-local" && on === "text/text", { off, on }];
});
T(
  "F10-lanes",
  "Turning Dates in properties off / on redraws a lanes card's date fields at once",
  async () => {
    await ev(`return await E.open("lanes", ${JSON.stringify(DATE_NOTE)})`);
    await sleep(900);
    const look = () => ev(`return ${dateField("ed_created")}?.type ?? null`);
    const before = await look();
    await setPlugin("isoDates", false);
    await sleep(1500);
    const off = await look();
    await setPlugin("isoDates", true);
    await sleep(1500);
    const on = await look();
    return [before === "text" && off === "datetime-local" && on === "text", { before, off, on }];
  },
  { needs: LANES },
);

// ----- G: settings tabs -----
T("G1", "The settings tab lists every setting with its description", async () => {
  await settingsTab(PLUGIN_ID);
  const r = await ev(
    `return [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].map(i=>i.querySelector(".setting-item-name").textContent + (i.querySelector(".checkbox-container.is-enabled")?" [on]":i.querySelector("input[type=text]")?" ["+i.querySelector("input[type=text]").value+"]":" [off]"))`,
  );
  await closeSettings();
  return [
    r.length === 8 &&
      r.filter(x => / \[on\]$/.test(x)).length === 7 &&
      r.includes(`Attachment folder [${D.attachmentFolder}]`),
    r,
  ];
});
T("G2", "A put-back redraws only the Settings tabs that show enforced values, not the open Editor tab", async () => {
  await settingsTab("editor");
  await clearNotices();
  await ev(
    `app.setting.activeTab.containerEl.createDiv({cls:"ed-test-marker"}); app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(1200); return 1`,
  );
  const r = {
    tab: await ev(`return app.setting.activeTab.id`),
    marker: await ev(`return !!app.setting.activeTab.containerEl.querySelector(".ed-test-marker")`),
    link: (await cfg()).link,
    notices: await notices(),
  };
  await ev(`app.setting.activeTab.containerEl.querySelector(".ed-test-marker")?.remove(); return 1`);
  await closeSettings();
  return [r.tab === "editor" && r.marker && r.link === "absolute" && r.notices.some(n => /New link format/.test(n)), r];
});

// ---------- run ----------
const required = new Set(
  (process.env.E2E_REQUIRE ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
);
const results = [];
const skipped = [];
let finalOk = false;
let errs = [];
try {
  await ev(`await E.prepare(); await E.lanesBegin(); E.errs.length=0; return 1`);
  const loaded = new Set(await ev(`return E.loadedIds()`));
  for (const cs of cases) {
    if (filter && !filter.test(cs.id) && !filter.test(cs.title)) continue;
    const missing = cs.needs.filter(id => !loaded.has(id));
    const present = cs.unless.filter(id => loaded.has(id));
    if (missing.length && !missing.some(id => required.has(id))) {
      skipped.push({ id: cs.id, needs: missing });
      console.log(`SKIP ${cs.id} (needs ${missing.join(", ")}: not enabled)`);
      continue;
    }
    if (present.length) {
      skipped.push({ id: cs.id, without: present });
      console.log(`SKIP ${cs.id} (runs only without ${present.join(", ")}: enabled)`);
      continue;
    }
    let pass = false;
    let evidence = null;
    if (missing.length) evidence = `needs ${missing.join(", ")}: not enabled (E2E_REQUIRE)`;
    else
      try {
        [pass, evidence] = await cs.fn();
      } catch (e) {
        evidence = "ERROR " + String(e.message || e).split("\n")[0];
      }
    // close what a case left open, so the next case's keys don't go into it: Settings, and every modal, also
    // prompts that have only a Cancel button (a rename prompt); Escape for anything still open
    try {
      await ev(
        `if (app.setting.isOpen) app.setting.close(); document.querySelectorAll(".modal-container").forEach(m=>m.querySelector(".modal-close-button, .mod-cancel")?.click()); return 1`,
      );
      for (let i = 0; i < 3 && (await ev(`return document.querySelectorAll(".modal-container").length`)); i++) {
        await c.key("Escape");
        await sleep(200);
      }
    } catch {}
    results.push({ id: cs.id, title: cs.title, pass, evidence });
    console.log(`${pass ? "PASS" : "FAIL"} ${cs.id} ${cs.title}${pass ? "" : "\n     " + JSON.stringify(evidence)}`);
  }
  errs = (await ev(`return E.errs`)).filter(e => !/MiniSearch|omnisearch/i.test(e));
  finalOk = okCfg(await cfg());
} finally {
  await ev(`await E.lanesEnd(); await E.restoreCore(); return 1`).catch(e => console.log("cleanup failed:", e.message));
}
const mine = errs.filter(isMine);
const byPlugin = {};
for (const s of skipped) for (const id of s.needs ?? s.without) byPlugin[id] = (byPlugin[id] ?? 0) + 1;
console.log(
  `\n${results.filter(r => r.pass).length}/${results.length} passed` +
    (skipped.length
      ? `, ${skipped.length} skipped (${Object.entries(byPlugin)
          .map(([id, n]) => `${id} ×${n}`)
          .join(", ")})`
      : "") +
    `; console errors: ${errs.length} (from Editor Defaults: ${mine.length})`,
);
if (errs.length) console.log(errs.join("\n---\n"));
console.log("final config ok:", finalOk);
fs.writeFileSync(
  new URL("./results.json", import.meta.url),
  JSON.stringify({ date: new Date().toISOString(), results, skipped, errs, finalOk }, null, 1),
);
process.exit(results.some(r => !r.pass) || mine.length || !finalOk ? 1 : 0);
