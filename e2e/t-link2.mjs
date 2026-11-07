import { setup, sleep } from "./lib.mjs";
const c = await setup();
async function pick(typed, k = "Enter", pre) {
  await c.ev2(`return await E.open("tab", "see ")`);
  if (pre) await c.ev2(pre);
  await c.type("[[");
  await c.type(typed);
  await sleep(800);
  const items = await c.ev2(
    `const s=app.workspace.editorSuggest.currentSuggest; return s? s.suggestions.values.slice(0,3).map(v=>v.type+":"+(v.file?.path||"")+":"+(v.alias||v.heading||"")):null`,
  );
  await c.key(k);
  await sleep(300);
  const t = await c.ev2("return E.text()");
  return { typed, items, t };
}
const P = 'app.plugins.plugins["obsidian-editor-defaults"]';
console.log(await pick("Abstraction delays tru", "Tab"));
console.log(await pick("Maya I"));
console.log(await pick("mayai"));
console.log(await pick("Outliner test - Headings#Goals"));
console.log(await pick("Abstraction delays tru", "Enter", `${P}.settings.stripAlias=false;`));
await c.ev2(
  `${P}.settings.stripAlias=true; ${P}.settings.forceRootPaths=false; app.vault.setConfig("newLinkFormat","relative")`,
);
console.log(await pick("Abstraction delays tru"));
await c.ev2(`app.vault.setConfig("newLinkFormat","shortest")`);
console.log(await pick("Abstraction delays tru"));
await c.ev2(
  `${P}.settings.forceRootPaths=true; await ${P}.applyDefaults(); return app.vault.getConfig("newLinkFormat")`,
);
console.log(await pick("Abstraction delays tru"));
process.exit(0);
