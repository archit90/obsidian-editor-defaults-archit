import { setup, sleep } from "./lib.mjs";
const c = await setup();
async function run(label, steps) {
  await c.ev2(`return await E.open("tab", "see ")`);
  await c.type("[[");
  for (const s of steps) {
    if (s.k) await c.key(s.k, s.m || {});
    else await c.type(s);
    await sleep(700);
  }
  await sleep(300);
  const items = await c.ev2(
    `const s=app.workspace.editorSuggest.currentSuggest; return s? s.suggestions.values.slice(0,3).map(v=>v.type+":"+(v.file?.path||"")+":"+(v.alias||v.heading||"")):null`,
  );
  console.log(label, JSON.stringify(await c.ev2("return E.text()")), "open:", items);
  await c.key("Escape");
}
await run("alias", ["Maya", { k: "ArrowDown" }, { k: "Enter" }]);
await run("alias2", ["Maya", { k: "Enter" }]);
await run("hash", ["Abstraction delays tru", "#"]);
await run("hash-pick", ["Abstraction delays tru", "#", { k: "Enter" }]);
await run("shift-enter", ["Abstraction delays tru", { k: "Enter", m: { shift: true } }]);
await run("caret", ["Abstraction delays tru", "^"]);
process.exit(0);
