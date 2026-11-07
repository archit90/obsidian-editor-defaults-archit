import { setup, sleep } from "./lib.mjs";
const c = await setup();
const modal = () =>
  c.ev2(
    `const m=document.querySelector(".modal-container .prompt"); return m? (m.querySelector(".prompt-input")?.placeholder||"prompt")+" items:"+m.querySelectorAll(".suggestion-item").length : null`,
  );
for (const s of (process.argv[2] || "tab,lanes,canvas-text,canvas-file").split(",")) {
  await c.ev2(`return await E.open(${JSON.stringify(s)}, "abc")`);
  await sleep(300);
  const before = await c.ev2(`return E.text()`);
  await c.key("n", { alt: true });
  await sleep(800);
  const m = await modal();
  const after = await c.ev2(`return E.text()`);
  await c.key("Escape");
  await sleep(400);
  // Alt+E (Templater's old insert default) must not open the insert modal
  await c.ev2(`E.editor.focus(); return 1`);
  await c.key("e", { alt: true });
  await sleep(800);
  const m2 = await modal();
  if (m2) await c.key("Escape");
  console.log(s, "Alt+N modal:", m, "| text changed:", before !== after, JSON.stringify(after), "| Alt+E modal:", m2);
}
// no editor focused: file explorer
await c.ev2(
  `app.workspace.getLeavesOfType("file-explorer")[0] && app.workspace.revealLeaf(app.workspace.getLeavesOfType("file-explorer")[0]); document.querySelector(".nav-files-container")?.focus(); app.workspace.setActiveLeaf(app.workspace.getLeavesOfType("file-explorer")[0], {focus:true}); return 1`,
);
await c.key("n", { alt: true });
await sleep(800);
console.log("explorer Alt+N:", await modal());
await c.key("Escape");
console.log(
  "errs",
  (await c.ev2("return E.errs")).filter(e => !/MiniSearch/.test(e)),
);
process.exit(0);
