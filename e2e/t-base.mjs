import { setup, sleep } from "./lib.mjs";
const c = await setup();
await c.ev2(`await E.file("_test/ed-b1.md","---\\ncreated: 2026-09-10T09:30:00\\ndue: 2026-11-06\\n---\\nx"); await E.file("_test/ed.base", 'filters:\\n  and:\\n    - file.inFolder("_test")\\n    - file.name.startsWith("ed-b")\\nviews:\\n  - type: table\\n    name: T\\n    order:\\n      - file.name\\n      - created\\n      - due\\n'); await E.routeException("_test/ed.base"); const l=app.workspace.getLeaf("tab"); await l.openFile(app.vault.getAbstractFileByPath("_test/ed.base")); await E.sleep(2000); E.baseLeaf=l; return 1`);
console.log(await c.ev2(`return [...E.baseLeaf.view.containerEl.querySelectorAll(".bases-td")].map(td=>td.getAttribute("data-property")+"="+td.textContent+" inputs:"+[...td.querySelectorAll("input")].map(i=>i.type+":"+i.value).join(","))`));
process.exit(0);
