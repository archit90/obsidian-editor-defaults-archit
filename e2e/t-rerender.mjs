import { setup, sleep } from "./lib.mjs";
const c = await setup();
const P = 'app.plugins.plugins["obsidian-editor-defaults"]';
await c.ev2(`return await E.open("tab", "---\\ncreated: 2026-09-10T09:30:00\\ndue: 2026-11-06\\n---\\nbody")`);
await sleep(800);
const types = () =>
  c.ev2(
    `const d=E.cm.dom.ownerDocument; const f=k=>[...d.querySelectorAll('.metadata-property[data-property-key="'+k+'"] .metadata-property-value > input:first-child')].filter(e=>E.view.containerEl.contains(e)).map(e=>e.type+":"+e.value).join(","); const b=E.baseLeaf? [...E.baseLeaf.view.containerEl.querySelectorAll(".bases-td[data-property='note.due'] input")].map(e=>e.type).join(","):"-"; return {created:f("created"), due:f("due"), base:b, btns: E.view.containerEl.querySelectorAll(".iso-date-picker").length}`,
  );
console.log("start", await types());
await c.ev2(`${P}.settings.isoDates=false; await ${P}.isoDatesChanged(); return 1`);
await sleep(600);
console.log("toggle off", await types());
await c.ev2(`${P}.settings.isoDates=true; await ${P}.isoDatesChanged(); return 1`);
await sleep(600);
console.log("toggle on", await types());
await c.ev2(`await app.plugins.disablePlugin("obsidian-editor-defaults"); return 1`);
await sleep(600);
console.log("plugin disabled", await types());
await c.ev2(`await app.plugins.enablePlugin("obsidian-editor-defaults"); return 1`);
await sleep(1200);
console.log("plugin enabled", await types());
console.log(
  "errs",
  (await c.ev2("return E.errs")).filter(e => !/MiniSearch/.test(e)),
);
process.exit(0);
