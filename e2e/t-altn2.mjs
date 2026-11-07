import { setup, sleep } from "./lib.mjs";
const c = await setup();
await c.ev2(`if(!E.created){E.created=[]; app.vault.on("create", f=>E.created.push(f.path));} return 1`);
for (const s of (process.argv[2]||"tab,lanes,canvas-text,canvas-file").split(",")) {
  await c.ev2(`E.created.length=0; return await E.open(${JSON.stringify(s)}, "abc")`);
  await sleep(300);
  await c.key("n", { alt: true }); await sleep(800);
  await c.type("zettel"); await sleep(500);
  await c.key("Enter"); await sleep(2500);
  const r = await c.ev2(`const f=E.created[0]; const af=app.workspace.getActiveFile(); const leaf=app.workspace.activeLeaf; return {created:E.created.slice(), active: af?.path, inLane: !!leaf?.containerEl.closest(".lane-split"), viewType: leaf?.view.getViewType(), origText: E.text(), content: f && app.vault.getAbstractFileByPath(f)?.extension==="md" ? (await app.vault.read(app.vault.getAbstractFileByPath(f))).slice(0,60):null, tpErr: document.querySelector(".notice")?.textContent}`);
  console.log(s, JSON.stringify(r));
  // clean up the created note
  await c.ev2(`for (const p of E.created) { const f=app.vault.getAbstractFileByPath(p); if (f) { for (const l of app.workspace.getLeavesOfType("markdown")) if (l.view.file===f) l.detach(); await app.vault.delete(f); } } return 1`);
}
process.exit(0);
