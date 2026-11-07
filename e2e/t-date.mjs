import { setup, sleep } from "./lib.mjs";
const c = await setup();
for (const s of (process.argv[2]||"tab,lanes,canvas-file").split(",")) {
  await c.ev2(`return await E.open(${JSON.stringify(s)}, "---\\ncreated: 2026-09-10T09:30:00\\ndue: 2026-11-06\\n---\\nbody")`);
  await sleep(1000);
  console.log(s, await c.ev2(`const root = E.cm.dom.closest(".view-content, .canvas-node-content, body") || document; const doc=E.cm.dom.ownerDocument; const els=[...doc.querySelectorAll('.metadata-property[data-property-key="created"] input, .metadata-property[data-property-key="due"] input')].filter(e=>E.view.containerEl ? E.view.containerEl.contains(e) : true); return els.map(e=>e.type+"="+e.value+" iso="+(e.dataset.isoDate||"-")+" btn="+!!e.parentElement.querySelector(".iso-date-picker"))`));
}
process.exit(0);
