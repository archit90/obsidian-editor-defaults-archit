import { setup, sleep } from "./lib.mjs";
const c = await setup();
const K = {
  "[": [219, "BracketLeft"],
  "]": [221, "BracketRight"],
  ArrowLeft: [37, "ArrowLeft"],
  ArrowRight: [39, "ArrowRight"],
};
async function press(k, mods) {
  const m = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0);
  const [vk, code] = K[k];
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, modifiers: m, windowsVirtualKeyCode: vk });
}
const cur = () =>
  c.ev2(
    `return app.workspace.getActiveFile()?.path + " | " + JSON.stringify(E.leafA?.view.editor?.getValue?.()?.slice(0,30))`,
  );
await c.ev2(
  `await E.routeException("_test/ed-navA.md"); await E.routeException("_test/ed-navB.md"); await E.file("_test/ed-navA.md","- a\\n  - b"); await E.file("_test/ed-navB.md","B"); const l=app.workspace.getLeaf("tab"); E.leafA=l; await l.openFile(app.vault.getAbstractFileByPath("_test/ed-navA.md")); await E.sleep(400); await l.openFile(app.vault.getAbstractFileByPath("_test/ed-navB.md")); await E.sleep(400); app.workspace.setActiveLeaf(l,{focus:true}); return 1`,
);
console.log("start", await cur());
for (const [k, mods, label] of [
  ["[", { ctrl: true }, "Ctrl+["],
  ["]", { ctrl: true }, "Ctrl+]"],
  ["ArrowLeft", { ctrl: true, alt: true }, "Ctrl+Alt+Left"],
  ["ArrowRight", { ctrl: true, alt: true }, "Ctrl+Alt+Right"],
]) {
  await c.ev2(`E.leafA.view.editor?.focus(); return 1`);
  await press(k, mods);
  await sleep(600);
  console.log(label, await cur());
}
// in a list item with the editor focused: does Ctrl+[ outdent or navigate?
await c.ev2(
  `await E.leafA.openFile(app.vault.getAbstractFileByPath("_test/ed-navB.md")); await E.sleep(300); await E.leafA.openFile(app.vault.getAbstractFileByPath("_test/ed-navA.md")); await E.sleep(400); const ed=E.leafA.view.editor; ed.focus(); ed.setCursor(1,5); return 1`,
);
await press("[", { ctrl: true });
await sleep(600);
console.log(
  "Ctrl+[ in list item:",
  await cur(),
  await c.ev2(`return app.vault.cachedRead(app.vault.getAbstractFileByPath("_test/ed-navA.md"))`),
);
process.exit(0);
