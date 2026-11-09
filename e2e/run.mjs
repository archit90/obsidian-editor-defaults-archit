// The Editor Defaults (Archit) end-to-end catalogue (TEST-CASES.md), against a sandbox Obsidian (e2e/sandbox.sh):
//   node e2e/run.mjs [--filter <id-regex>]      (npm run e2e)
// CDP_PORT: the sandbox's DevTools port (default: cdp.mjs's, sandbox 2). A case that needs another plugin says so
// (`needs`: community plugin ids, or core:<id>) and is skipped without it; E2E_REQUIRE=<id>,<id> turns those skips
// into failures (for runs with the other plugins). A case about life without a plugin (`unless`) is skipped while
// that plugin is loaded. Results go to e2e/results.json; the exit code is 1 when a case fails.
import fs from "node:fs";
import { PATHS, PICK_LINK, PICK_QUERY, SETTINGS_NOTE, SETTINGS_TEXT } from "./fixtures.mjs";
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
/** Closes Settings, and waits out the moment after it in which a change still counts as made there (3 s). */
const closeSettings = async () => {
  const open = await ev(`const o=app.setting.isOpen; app.setting.close(); return o`);
  if (open) await sleep(3200);
};
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

// ----- A: load, reload, unload -----
const noteText = () => ev(`return await E.note()`);
const resetNote = () => ev(`return await E.resetNote()`);
/** The suite's settings note with `edit` applied to its text (a function of the text, as page code), then applied. */
const editNote = (edit, wait = 2500) =>
  ev(
    `const f=app.vault.getAbstractFileByPath(${JSON.stringify(SETTINGS_NOTE)}); await app.vault.process(f, t=>(${edit})(t)); await E.sleep(${wait}); return 1`,
  );
/** Whether the note's line for `key` reads `key: value` (YAML as the plugin writes it). */
const lineOf = (text, key) => (text.match(new RegExp(`^\\s*${key.replace(/[[\]+]/g, "\\$&")}:.*$`, "m")) ?? [null])[0];
const saved = n => n.some(x => /saved to the settings note/.test(x));

T("A2", "Disable, drift everything, enable: the settings note is applied again", async () => {
  await ev(
    `await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); app.vault.setConfig("newLinkFormat","shortest"); app.vault.setConfig("trashOption","system"); app.vault.setConfig("attachmentFolderPath","./"); await app.internalPlugins.plugins["zk-prefixer"].enable(true); await app.internalPlugins.plugins.bases.disable(true); app.hotkeyManager.setHotkeys("app:go-back",[]); app.hotkeyManager.removeHotkeys("templater-obsidian:insert-templater"); await app.hotkeyManager.save(); await E.sleep(800); return 1`,
  );
  const drifted = await cfg();
  await ev(`await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(2500); return 1`);
  const after = await cfg();
  return [
    okCfg(after) && !okCfg(drifted),
    { drifted: [drifted.link, drifted.trash, drifted.att, drifted.core], after },
  ];
});
T("A3", "Applying when the vault matches the note writes nothing (idempotent)", async () => {
  const r = await ev(
    `const fs=require("fs"), base=app.vault.adapter.basePath+"/.obsidian/"; const m=()=>["app.json","hotkeys.json","core-plugins.json"].map(f=>fs.existsSync(base+f)? fs.statSync(base+f).mtimeMs : null); await E.sleep(1200); const a=m(); const note=await E.note(); await ${P}.setup.run(); await E.sleep(1500); const b=m(); return {a,b,diff:(await ${P}.setup.plan()).differences, same: note===await E.note()}`,
  );
  return [eq(r.a, r.b) && r.a.some(t => t !== null) && r.diff.length === 0 && r.same, r];
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
  await ev(`await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(2000); return 1`);
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
  "Templater disabled: no errors, its hotkeys still written by id; Alt+N back once Templater is on",
  async () => {
    await ev(
      `E.errs.length=0; await app.plugins.disablePlugin("templater-obsidian"); app.hotkeyManager.removeHotkeys(${JSON.stringify(TEMPLATER_NEW)}); await app.hotkeyManager.save(); await E.sleep(1200); return 1`,
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
T("A7", "An older data.json (0.1.1's enforce toggles) is read without them; its other settings stay", async () => {
  const r = await ev(
    `const p=${P}; const d=await p.loadData(); await p.saveData({forceTrash:false, attachmentFolder:"x", stripAlias:false, setupNote:d.setupNote}); await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(1500); const s={...${P}.settings}; await ${P}.saveData(d ?? {}); await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); await E.sleep(1500); return s`,
  );
  return [
    r.stripAlias === false &&
      r.isoDates === true &&
      !("forceTrash" in r) &&
      !("attachmentFolder" in r) &&
      r.setupEnabled,
    r,
  ];
});
T("A8", "The plugin's settings changed on disk (another device, through sync) are used at once", async () => {
  const r = await ev(
    `const fs=require("fs"), file=app.vault.adapter.basePath+"/"+${P}.manifest.dir+"/data.json"; const before=fs.readFileSync(file,"utf8"); const cur={...${P}.settings}; fs.writeFileSync(file, JSON.stringify({...cur, stripAlias:false}, null, 2)); for (let i=0; i<40 && ${P}.settings.stripAlias; i++) await E.sleep(250); const off=${P}.settings.stripAlias; fs.writeFileSync(file, before); for (let i=0; i<40 && !${P}.settings.stripAlias; i++) await E.sleep(250); return {off, on: ${P}.settings.stripAlias}`,
  );
  return [r.off === false && r.on === true, r];
});
T("A9", "A change that comes in while one is being put back is put back too, not dropped", async () => {
  await clearNotices();
  // Unique note creator turned on is turned off again; while that runs, something sets Deleted files
  const r = await ev(
    `const zk=app.internalPlugins.plugins["zk-prefixer"]; zk.disable=async function(...a){ app.vault.setConfig("trashOption","system"); delete zk.disable; return zk.disable(...a); }; await zk.enable(true); await E.sleep(2500); if (Object.hasOwn(zk,"disable")) delete zk.disable; return {zk: zk.enabled, trash: app.vault.getConfig("trashOption")}`,
  );
  return [r.zk === false && r.trash === "local", r];
});

// ----- B: Obsidian's settings (the app block) -----
/** Picks `value` in the select of Settings → Files and links' item `name`; returns what happened. */
const fileSetting = async (name, value) => {
  await settingsTab("file");
  await clearNotices();
  await ev(
    `const s=${settingItem(name)}.querySelector("select"); s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event("change")); return 1`,
  );
  await sleep(1800);
  const r = { cfg: await cfg(), note: await noteText(), notices: await notices() };
  await closeSettings();
  return r;
};
T(
  "B2",
  "Settings → Files and links: New link format changed to Relative goes into the note, dated; it stays",
  async () => {
    const r = await fileSetting("New link format", "relative");
    await resetNote();
    const back = (await cfg()).link;
    return [
      r.cfg.link === "relative" &&
        lineOf(r.note, "newLinkFormat") === "  newLinkFormat: relative" &&
        /- `newLinkFormat` changed in Settings, \d{4}-\d\d-\d\d\./.test(r.note) &&
        saved(r.notices) &&
        back === "absolute",
      { link: r.cfg.link, line: lineOf(r.note, "newLinkFormat"), notices: r.notices, back },
    ];
  },
);
T(
  "B2d",
  "Settings → Files and links: New link format back to Obsidian's default (Shortest) is taken out of the note",
  async () => {
    const r = await fileSetting("New link format", "shortest");
    await resetNote();
    return [
      r.cfg.link === "shortest" &&
        lineOf(r.note, "newLinkFormat") === null &&
        /- `newLinkFormat` back to its default in Settings, .*: taken out\./.test(r.note),
      { link: r.cfg.link, note: r.note.slice(0, 400) },
    ];
  },
);
T("B11", "Settings → Files and links: Deleted files → Permanently delete goes into the note", async () => {
  const r = await fileSetting("Deleted files", "none");
  await resetNote();
  return [
    r.cfg.trash === "none" && lineOf(r.note, "trashOption") === "  trashOption: none",
    { trash: r.cfg.trash, line: lineOf(r.note, "trashOption") },
  ];
});
T("B3", "app.json changed on disk (sync) is put back and written back, with a notice", async () => {
  await clearNotices();
  await sleep(3000);
  // Obsidian's file watcher can miss a write: wait for its raw event on app.json, and write again if none came
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
    note: await noteText(),
  };
  return [
    r.cfg.link === "absolute" &&
      r.cfg.att === D.attachmentFolder &&
      eq(r.disk, ["absolute", D.attachmentFolder]) &&
      r.notices.some(n => /put back/.test(n) && /New link format/.test(n)) &&
      lineOf(r.note, "newLinkFormat") === "  newLinkFormat: absolute",
    { link: r.cfg.link, att: r.cfg.att, disk: r.disk, notices: r.notices },
  ];
});
T(
  "B5",
  "Another plugin changing New link format (Settings closed) is put back, with a notice naming it and the note",
  async () => {
    await clearNotices();
    await ev(`app.vault.setConfig("newLinkFormat","shortest"); await E.sleep(1200); return 1`);
    const r = { link: (await cfg()).link, notices: await notices() };
    return [
      r.link === "absolute" &&
        r.notices.some(n => /put back "New link format" from the settings note/.test(n) && n.includes(SETTINGS_NOTE)),
      r,
    ];
  },
);
T("B6", "New attachments go to the attachment folder", async () => {
  const p = await ev(
    `return await app.fileManager.getAvailablePathForAttachment("ed-test.png", ${JSON.stringify(PATHS.tab)})`,
  );
  return [p === `${D.attachmentFolder}/ed-test.png`, p];
});
T("B10", "Deleting a note moves it to .trash", async () => {
  const r = await ev(
    `const fs=require("fs"), t=app.vault.adapter.basePath+"/.trash/del.md"; if (fs.existsSync(t)) fs.rmSync(t); const p=${JSON.stringify(`${PATHS.tabFolder}del.md`)}; const f=await E.file(p,"x"); await E.sleep(400); await app.fileManager.trashFile(f); await E.sleep(500); return {inVault: !!app.vault.getAbstractFileByPath(p), inTrash: fs.existsSync(t)}`,
  );
  return [!r.inVault && r.inTrash, r];
});
T("B12", "Editing the note applies it within 2 s", async () => {
  await editNote(`t=>t.replace("trashOption: local","trashOption: system")`);
  const changed = (await cfg()).trash;
  await resetNote();
  const back = (await cfg()).trash;
  return [changed === "system" && back === "local", { changed, back }];
});

// ----- C: core plugins -----
const corePlugin = id => `app.internalPlugins.plugins[${JSON.stringify(id)}]`;
const isCore = id => ev(`return ${corePlugin(id)}.enabled`);
const setCore = (id, on) =>
  ev(`await ${corePlugin(id)}.${on ? "enable" : "disable"}(true); await E.sleep(900); return 1`);
const toggleCore = async name => {
  await settingsTab("plugins");
  await clearNotices();
  await ev(`${settingItem(name)}.querySelector(".checkbox-container").click(); return 1`);
  await sleep(1800);
};
/** Core plugin `id`, which the note keeps off while `partner` is loaded, switched on in Settings: the note follows. */
const replacedCaptured = (id, name, partner, simulated) => async () => {
  if (simulated) await ev(`E.simulate(${JSON.stringify(partner)}); return 1`);
  try {
    if (await isCore(id)) await setCore(id, false);
    await toggleCore(name);
    const r = { on: await isCore(id), note: await noteText(), notices: await notices() };
    await closeSettings();
    return [
      r.on === true && r.note.includes(`\n  ${id}:\n    enabled: true\n    onlyWith: ${partner}\n`) && saved(r.notices),
      { on: r.on, line: lineOf(r.note, id), notices: r.notices },
    ];
  } finally {
    await closeSettings();
    await resetNote();
    if (simulated) await ev(`E.unsimulate(${JSON.stringify(partner)}); return 1`);
  }
};
/** Without `partner` the rule isn't in force: switched on in Settings it stays on, and the note isn't changed. */
const replacedLeftAlone = (id, name) => async () => {
  const was = await isCore(id);
  try {
    if (was) await setCore(id, false);
    const before = await noteText();
    await toggleCore(name);
    const r = { on: await isCore(id), same: before === (await noteText()) };
    await closeSettings();
    await setCore(id, false);
    await setCore(id, true);
    r.outside = await isCore(id);
    return [r.on && r.same && r.outside, r];
  } finally {
    await closeSettings();
    await setCore(id, was);
  }
};
/** Core plugin `id` switched on outside Settings while `partner` is loaded: switched off again, with a notice. */
const replacedPutBack = (id, name, partner, simulated) => async () => {
  if (simulated) await ev(`E.simulate(${JSON.stringify(partner)}); return 1`);
  try {
    if (await isCore(id)) await setCore(id, false);
    await clearNotices();
    await ev(`await ${corePlugin(id)}.enable(true); return 1`);
    await sleep(1300);
    const r = { on: await isCore(id), notices: await notices() };
    return [r.on === false && r.notices.some(n => /put back/.test(n) && n.includes(`core plugin ${name}`)), r];
  } finally {
    if (simulated) await ev(`E.unsimulate(${JSON.stringify(partner)}); return 1`);
  }
};
T(
  "C2",
  "Settings → Core plugins: Backlinks on while Backlinks Full View is enabled goes into the note (onlyWith kept)",
  replacedCaptured("backlink", "Backlinks", "backlinks-full-view", false),
  { needs: BFV },
);
T(
  "C2s",
  "The same with Backlinks Full View simulated",
  replacedCaptured("backlink", "Backlinks", "backlinks-full-view", true),
  { unless: BFV },
);
T(
  "C2n",
  "Without Backlinks Full View, core Backlinks is left alone: on in Settings or outside, it stays on; the note is unchanged",
  replacedLeftAlone("backlink", "Backlinks"),
  { unless: BFV },
);
T(
  "C3",
  "Settings → Core plugins: Random note on is added to the note; off again (its default) is taken out",
  async () => {
    await toggleCore("Random note");
    const on = { core: await isCore("random-note"), line: lineOf(await noteText(), "random-note") };
    await toggleCore("Random note");
    const off = { core: await isCore("random-note"), note: await noteText() };
    await closeSettings();
    await resetNote();
    return [
      on.core &&
        on.line === "  random-note: true" &&
        !off.core &&
        lineOf(off.note, "random-note") === null &&
        /`random-note` back to its default/.test(off.note),
      { on, off: { core: off.core, line: lineOf(off.note, "random-note") } },
    ];
  },
);
T(
  "C3t",
  "Core Templates switched on outside Settings is switched off again while Templater is enabled",
  replacedPutBack("templates", "Templates", "templater-obsidian", false),
  { needs: TEMPLATER },
);
T("C3ts", "The same with Templater simulated", replacedPutBack("templates", "Templates", "templater-obsidian", true), {
  unless: TEMPLATER,
});
T("C3n", "Without Templater, core Templates is left alone", replacedLeftAlone("templates", "Templates"), {
  unless: TEMPLATER,
});
T(
  "C4",
  "Bases switched off outside Settings is switched on again; Daily notes (not in the note) is left alone",
  async () => {
    const daily = await isCore("daily-notes");
    await ev(
      `await ${corePlugin("bases")}.disable(true); await ${corePlugin("daily-notes")}.${daily ? "disable" : "enable"}(true); await E.sleep(1500); return 1`,
    );
    const r = { bases: await isCore("bases"), daily: await isCore("daily-notes") };
    await setCore("daily-notes", daily);
    return [r.bases === true && r.daily === !daily, { ...r, dailyBefore: daily }];
  },
);

// ----- D: hotkeys -----
T("D1", "Exactly the note's hotkeys, and an explicit [] for the insert template modal", async () => {
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
T(
  "D6",
  "Settings → Hotkeys: removing Ctrl+[ from Navigate back leaves its default, so it's taken out of the note",
  async () => {
    await settingsTab("hotkeys");
    await clearNotices();
    const r = await ev(
      `const t=app.setting.activeTab; const inp=t.containerEl.querySelector(".search-input-container input"); inp.value="Navigate back"; inp.dispatchEvent(new Event("input")); await E.sleep(400); const row=()=>[...t.containerEl.querySelectorAll(".setting-item")].find(i=>i.offsetParent && i.querySelector(".setting-item-name")?.textContent==="Navigate back"); const hk=[...row().querySelectorAll(".setting-hotkey")].find(h=>/\\[/.test(h.textContent)); hk.querySelector(".setting-hotkey-icon, .setting-delete-hotkey").click(); await E.sleep(1800); return {hk: app.hotkeyManager.getHotkeys("app:go-back"), filter: inp.value}`,
    );
    r.note = await noteText();
    r.notices = await notices();
    await closeSettings();
    await resetNote();
    r.back = (await cfg()).hk["app:go-back"];
    return [
      eq(r.hk, [{ modifiers: ["Mod", "Alt"], key: "ArrowLeft" }]) &&
        r.filter === "Navigate back" &&
        lineOf(r.note, "app:go-back") === null &&
        /`app:go-back` back to its default in Settings/.test(r.note) &&
        saved(r.notices) &&
        eq(r.back, WANT_HK["app:go-back"]),
      { hk: r.hk, line: lineOf(r.note, "app:go-back"), notices: r.notices, back: r.back },
    ];
  },
);
T("D8", "'Restore default' on Alt+N's command outside Settings is put back, named in the notice", async () => {
  await clearNotices();
  await ev(
    `app.hotkeyManager.removeHotkeys(${JSON.stringify(TEMPLATER_NEW)}); await app.hotkeyManager.save(); await E.sleep(1200); return 1`,
  );
  const r = { hk: (await cfg()).hk[TEMPLATER_NEW], notices: await notices() };
  return [
    eq(r.hk, WANT_HK[TEMPLATER_NEW]) &&
      r.notices.some(
        n =>
          /put back the hotkeys of "/.test(n) && /create-new-note-from-template|Create new note from template/.test(n),
      ),
    r,
  ];
});
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
    // a run of the note starts the fight limits afresh (earlier cases put Deleted files back too)
    await ev(`await ${P}.setup.run(); return 1`);
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
    await ev(`await ${P}.setup.run(); return 1`);
    await clearNotices();
    const r = await ev(
      `let n=0; const ref=app.vault.on("config-changed", k=>{ if(k==="trashOption" && app.vault.getConfig("trashOption")==="local"){ n++; setTimeout(()=>app.vault.setConfig("trashOption","system"),10);} }); app.vault.setConfig("trashOption","system"); await E.sleep(25000); app.vault.offref(ref); return {n, v: app.vault.getConfig("trashOption")}`,
    );
    const shown = (await notices()).filter(n => /stopped putting back/.test(n));
    // a change of the settings note puts it back again
    await editNote(`t=>t+"\\n"`);
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
T("E7", "Relative and shortest link formats (the vault setup off): only the alias goes", async () => {
  await ev(
    `${P}.settings.forceRootPaths=false; ${P}.settings.setupEnabled=false; await ${P}.saveSettings(); app.vault.setConfig("newLinkFormat","relative"); return 1`,
  );
  const rel = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  const relHead = await linkPick("tab", ["ed-target#Goa", { k: "Enter" }]);
  await ev(`app.vault.setConfig("newLinkFormat","shortest"); return 1`);
  const short = await linkPick("tab", [PICK_QUERY, { k: "Enter" }]);
  await ev(
    `${P}.settings.forceRootPaths=true; ${P}.settings.setupEnabled=true; await ${P}.saveSettings(); await E.sleep(500); return 1`,
  );
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

// ----- S: the vault setup -----
const FIRST_RUN = "editor-defaults-archit:setup-applied";
/** The setup dialog's text, once it's open (or null after `ms`). */
const setupDialog = (ms = 5000) =>
  waitFor(
    `const m=[...document.querySelectorAll(".modal")].find(m=>/Set up this vault/.test(m.innerText)); return m? m.innerText : null`,
    ms,
  );
const dialogButton = text =>
  ev(
    `const b=[...document.querySelectorAll(".modal button")].find(b=>b.innerText===${JSON.stringify(text)}); if(!b) return false; b.click(); return true`,
  );
const waitRun = (ms = 60000) =>
  ev(
    `const t0=Date.now(); while(Date.now()-t0<${ms}){ await E.sleep(300); if(${P}.setup.status.lastRun>t0-200 && !document.querySelector(".modal")) break; } return 1`,
  );
const HIDER = "obsidian-hider";
const hiderBlock = (extra = "") =>
  `\n\n## Hider\n\n\`\`\`vault-settings\nplugin: ${HIDER}\nsource: community\n${extra}settings:\n  hideStatus: true\n\`\`\`\n`;
/** The note with the Hider block (the runner puts the suite's note back after each case). */
const withHider = () => editNote(`t=>t.includes("plugin: ${HIDER}")? t : t+${JSON.stringify(hiderBlock())}`, 2500);
const pluginState = id =>
  ev(
    `return {installed: !!app.plugins.manifests[${JSON.stringify(id)}], enabled: app.plugins.enabledPlugins.has(${JSON.stringify(id)}), loaded: !!app.plugins.plugins[${JSON.stringify(id)}]}`,
  );

T(
  "S1",
  "This plugin's own setting turned off in its tab goes into its block; on again (its default) is taken out",
  async () => {
    await settingsTab(PLUGIN_ID);
    const click = () =>
      ev(`${settingItem("Insert [[path]] without alias")}.querySelector(".checkbox-container").click(); return 1`);
    await click();
    await sleep(1800);
    const off = { s: await ev(`return ${P}.settings.stripAlias`), note: await noteText() };
    await click();
    await sleep(1800);
    const on = { s: await ev(`return ${P}.settings.stripAlias`), note: await noteText() };
    await closeSettings();
    await resetNote();
    return [
      off.s === false &&
        /plugin: editor-defaults-archit[\s\S]*settings:\n\s+stripAlias: false/.test(off.note) &&
        on.s === true &&
        lineOf(on.note, "stripAlias") === null,
      { off: { s: off.s, line: lineOf(off.note, "stripAlias") }, on: { s: on.s, line: lineOf(on.note, "stripAlias") } },
    ];
  },
);
T("S2", "A property type set from a note goes into the note (a new block); unset, it's taken out", async () => {
  await ev(`await app.metadataTypeManager.setType("ed_kind","number"); await E.sleep(1800); return 1`);
  const set = await noteText();
  await ev(`await app.metadataTypeManager.unsetType("ed_kind"); await E.sleep(1800); return 1`);
  const unset = await noteText();
  await resetNote();
  return [
    /```vault-settings\nobsidian: property-types\nsettings:\n(?:[^`]*\n)? {2}ed_kind: number\n/.test(set) &&
      lineOf(unset, "ed_kind") === null,
    { set: set.slice(set.indexOf("property-types") - 40), unset: lineOf(unset, "ed_kind") },
  ];
});
T("S3", "A block with a YAML error: a notice names its line; the other blocks still apply", async () => {
  await clearNotices();
  await editNote(
    `t=>t.replace("trashOption: local","trashOption: system")+"\\n## Broken\\n\\n\`\`\`vault-settings\\nplugin: [x\\n\`\`\`\\n"`,
  );
  const r = {
    trash: (await cfg()).trash,
    notices: await notices(),
    errors: await ev(`return ${P}.setup.status.errors.map(e=>e.at.line+": "+e.message)`),
  };
  await resetNote();
  return [
    r.trash === "system" &&
      r.errors.length === 1 &&
      r.notices.some(n => /block at line \d+/.test(n) && /isn't used/.test(n)),
    r,
  ];
});
T("S4", "A block with only: mobile isn't applied on desktop", async () => {
  await editNote(
    `t=>t.replace("obsidian: app\\n","obsidian: app\\nonly: mobile\\n").replace("trashOption: local","trashOption: none")`,
  );
  const r = { trash: (await cfg()).trash, diff: await ev(`return (await ${P}.setup.plan()).differences`) };
  await resetNote();
  return [r.trash === "local" && r.diff.length === 0, r];
});
T("S5", "A block for a core plugin's config file (canvas.json) is written to the file and to core Canvas", async () => {
  const before = await ev(
    `const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/canvas.json"; return fs.existsSync(f)? fs.readFileSync(f,"utf8") : null`,
  );
  await editNote(
    `t=>t+"\\n## Canvas\\n\\n\`\`\`vault-settings\\nobsidian: canvas\\nsettings:\\n  newFileLocation: folder\\n  newFileFolderPath: _test/ed-c\\n\`\`\`\\n"`,
  );
  const r = await ev(
    `const a=JSON.parse(require("fs").readFileSync(app.vault.adapter.basePath+"/.obsidian/canvas.json","utf8")); return {file:[a.newFileLocation,a.newFileFolderPath], live: app.internalPlugins.plugins.canvas.instance.options?.newFileFolderPath}`,
  );
  await resetNote();
  await ev(
    `const fs=require("fs"), f=app.vault.adapter.basePath+"/.obsidian/canvas.json"; const b=${JSON.stringify(before)}; if (b===null) fs.rmSync(f,{force:true}); else fs.writeFileSync(f,b); await app.internalPlugins.plugins.canvas.instance.onExternalSettingsChange?.(); return 1`,
  );
  return [eq(r.file, ["folder", "_test/ed-c"]) && r.live === "_test/ed-c", r];
});
T(
  "S6",
  "No settings note: the plugin's default is created, dated; the dialog asks, as on a new device; Not now changes nothing",
  async () => {
    const other = "ed-boot-settings.md"; // at the vault root, as the default note is
    const before = await cfg();
    await ev(`const ed=${P}; ed.settings.setupNote=${JSON.stringify(other)}; void ed.saveSettings(); return 1`);
    const dialog = await setupDialog(8000);
    if (dialog) await dialogButton("Not now");
    await sleep(1500);
    const r = await ev(
      `const f=app.vault.getAbstractFileByPath(${JSON.stringify(other)}); const text=f? await app.vault.read(f) : ""; if (f) await app.vault.delete(f); return {text: text.slice(0,200), templater: text.includes("plugin: templater-obsidian"), today: text.includes("created: "+window.moment().format("YYYY-MM-DD"))}`,
    );
    const after = await cfg();
    await resetNote();
    return [
      r.templater &&
        r.today &&
        /Plugins to install/.test(dialog ?? "") &&
        /Update the note from this vault/.test(dialog ?? "") &&
        after.trash === before.trash &&
        after.link === before.link,
      { dialog: dialog?.slice(0, 300), ...r },
    ];
  },
);
/** First run on this device with the vault drifted (trash: none): the dialog lists it; `button` is clicked. */
const firstRun = async button => {
  await ev(
    `await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); app.vault.setConfig("trashOption","none"); app.saveLocalStorage(${JSON.stringify(FIRST_RUN)}, null); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); return 1`,
  );
  const dialog = await setupDialog();
  if (!dialog)
    console.log(
      "     first-run diagnostics:",
      JSON.stringify(
        await ev(
          `return {status: ${P}.setup.status, marker: app.loadLocalStorage(${JSON.stringify(FIRST_RUN)}), modals: [...document.querySelectorAll(".modal")].map(m=>m.innerText.slice(0,80)), note: ${P}.settings.setupNote, enabled: ${P}.settings.setupEnabled, trash: app.vault.getConfig("trashOption")}`,
        ),
      ),
    );
  if (dialog) await dialogButton(button);
  await sleep(1500);
  return {
    dialog,
    trash: (await cfg()).trash,
    note: await noteText(),
    marked: await ev(`return !!app.loadLocalStorage(${JSON.stringify(FIRST_RUN)})`),
  };
};
T(
  "S7",
  "First run on a device: the dialog lists what differs; 'Update the note from this vault' takes the vault's values",
  async () => {
    const r = await firstRun("Update the note from this vault");
    await resetNote();
    return [
      /Deleted files/.test(r.dialog ?? "") &&
        r.trash === "none" &&
        lineOf(r.note, "trashOption") === "  trashOption: none" &&
        r.marked,
      { dialog: r.dialog, trash: r.trash, line: lineOf(r.note, "trashOption"), marked: r.marked },
    ];
  },
);
T("S8", "First run on a device: 'Apply the note' applies it", async () => {
  const r = await firstRun("Apply the note");
  await resetNote();
  return [
    !!r.dialog && r.trash === "local" && lineOf(r.note, "trashOption") === "  trashOption: local" && r.marked,
    { dialog: !!r.dialog, trash: r.trash, marked: r.marked },
  ];
});
T("S9", "First run, 'Not now': nothing changes; the command asks again", async () => {
  const r = await firstRun("Not now");
  await ev(`app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:apply-settings-note`)}); return 1`);
  const again = await setupDialog();
  if (again) await dialogButton("Apply the note");
  await sleep(1500);
  const after = (await cfg()).trash;
  await resetNote();
  return [
    !!r.dialog && r.trash === "none" && !r.marked && !!again && after === "local",
    { trash: r.trash, marked: r.marked, again: !!again, after },
  ];
});
T(
  "S10",
  "A plugin in the note that isn't installed: one dialog, then it's installed from its release, with the note's settings, enabled",
  async () => {
    await ev(
      `if (app.plugins.manifests[${JSON.stringify(HIDER)}]) await app.plugins.uninstallPlugin(${JSON.stringify(HIDER)}); return 1`,
    );
    await editNote(`t=>t+${JSON.stringify(hiderBlock())}`, 1500);
    const dialog = await setupDialog(8000);
    if (dialog) await dialogButton("Apply and install");
    await waitFor(`return !!app.plugins.plugins[${JSON.stringify(HIDER)}]`, 60000);
    await sleep(1500);
    const r = {
      dialog,
      state: await pluginState(HIDER),
      data: await ev(
        `const m=app.plugins.manifests[${JSON.stringify(HIDER)}]; return m? JSON.parse(await app.vault.adapter.read(m.dir+"/data.json")) : null`,
      ),
      live: await ev(`return app.plugins.plugins[${JSON.stringify(HIDER)}]?.settings?.hideStatus`),
      defaults: await ev(`return !!${P}.setup.defaultsStore[${JSON.stringify(HIDER)}]`),
    };
    return [
      /Hider|obsidian-hider/.test(dialog ?? "") &&
        r.state.enabled &&
        r.data?.hideStatus === true &&
        r.live === true &&
        r.defaults,
      r,
    ];
  },
);
T(
  "S11",
  "Its data.json changed on disk is put back, and the plugin has the note's value again",
  async () => {
    await withHider();
    await ev(
      `const m=app.plugins.manifests[${JSON.stringify(HIDER)}]; const f=m.dir+"/data.json"; const d=JSON.parse(await app.vault.adapter.read(f)); d.hideStatus=false; let seen=0; const ref=app.vault.on("raw", p=>{ if(p===f) seen++; }); for (let i=0;i<3 && !seen;i++){ require("fs").writeFileSync(app.vault.adapter.basePath+"/"+f, JSON.stringify(d,null,2)); for (let k=0;k<20 && !seen;k++) await E.sleep(200); } app.vault.offref(ref); await E.sleep(3000); return seen`,
    );
    const r = {
      data: await ev(
        `const m=app.plugins.manifests[${JSON.stringify(HIDER)}]; return JSON.parse(await app.vault.adapter.read(m.dir+"/data.json")).hideStatus`,
      ),
      live: await ev(`return app.plugins.plugins[${JSON.stringify(HIDER)}]?.settings?.hideStatus`),
    };
    return [r.data === true && r.live === true, r];
  },
  { needs: [HIDER] },
);
T(
  "S12",
  "Turned off in Settings → Community plugins: the note says state: disabled; state: enabled in the note turns it on",
  async () => {
    await withHider();
    await settingsTab("community-plugins");
    await ev(`await app.plugins.disablePluginAndSave(${JSON.stringify(HIDER)}); await E.sleep(1800); return 1`);
    const off = { state: await pluginState(HIDER), note: await noteText() };
    await closeSettings();
    await sleep(3200);
    await editNote(`t=>t.replace("state: disabled\\n","")`, 2500);
    const on = await pluginState(HIDER);
    return [
      !off.state.enabled && /plugin: obsidian-hider\nsource: community\nstate: disabled/.test(off.note) && on.enabled,
      { off: off.state, on },
    ];
  },
  { needs: [HIDER] },
);
T(
  "S13",
  "state: disabled in the note turns it off; state: uninstalled asks, then removes it",
  async () => {
    await withHider();
    await editNote(
      `t=>t.replace("plugin: obsidian-hider\\nsource: community\\n","plugin: obsidian-hider\\nsource: community\\nstate: disabled\\n")`,
      2500,
    );
    const off = await pluginState(HIDER);
    await editNote(`t=>t.replace("state: disabled","state: uninstalled")`, 1500);
    const dialog = await setupDialog(8000);
    if (dialog) await dialogButton("Apply and install");
    await sleep(2500);
    const gone = await pluginState(HIDER);
    await resetNote();
    return [
      off.installed && !off.enabled && /Plugins to remove/.test(dialog ?? "") && !gone.installed,
      { off, dialog, gone },
    ];
  },
  { needs: [HIDER] },
);
T(
  "S14",
  "A github: source is added to BRAT's list",
  async () => {
    const r = await ev(`return ${P}.setup.status && app.plugins.plugins["obsidian42-brat"].settings.pluginList`);
    return [Array.isArray(r) && r.includes("archit90/obsidian-editor-defaults-archit"), r];
  },
  { needs: ["obsidian42-brat"] },
);

// ----- G: settings tab -----
T("G1", "The settings tab: three behaviour toggles on, and the vault setup with its note and status", async () => {
  await settingsTab(PLUGIN_ID);
  const r = await ev(
    `return [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].map(i=>i.querySelector(".setting-item-name").textContent + (i.querySelector(".checkbox-container.is-enabled")?" [on]":i.querySelector("input[type=text]")?" ["+i.querySelector("input[type=text]").value+"]":i.querySelector(".checkbox-container")?" [off]":"") + (i.querySelector(".setting-item-description")?.textContent ? " — "+i.querySelector(".setting-item-description").textContent.slice(0,60) : ""))`,
  );
  await closeSettings();
  return [
    r.filter(x => / \[on\]/.test(x)).length === 4 &&
      r.some(x => x.startsWith(`Settings note [${SETTINGS_NOTE}]`)) &&
      r.some(x => /^Status — The vault matches the note\./.test(x)),
    r,
  ];
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
  for (const cs of cases) {
    if (filter && !filter.test(cs.id) && !filter.test(cs.title)) continue;
    // what's loaded now: a case may install a plugin later cases need (S10)
    const loaded = new Set(await ev(`return E.loadedIds()`));
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
    try {
      if ((await ev(`return await E.note()`)) !== SETTINGS_TEXT) await ev(`return await E.resetNote()`);
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
