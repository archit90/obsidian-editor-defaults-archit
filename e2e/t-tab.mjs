import { setup, sleep } from "./lib.mjs";
const c = await setup();
await c.ev2(`return await E.open("tab", "see ")`);
await c.ev2(`const s=app.workspace.editorSuggest.suggests[0]; window.__calls=[]; const o=s.selectSuggestion; if(!s.__dbg){s.__dbg=1; s.selectSuggestion=function(...a){window.__calls.push("sel "+a[0]?.type+" "+a[1]?.key); const r=o.apply(this,a); window.__calls.push("after "+JSON.stringify(this.context?.editor?.getCursor())+" "+JSON.stringify(E.text())); return r}}`);
await c.type("[["); await c.type("Abstraction delays tru"); await sleep(800);
await c.key(process.argv[2]||"Tab"); await sleep(300);
console.log(await c.ev2("return [E.text(), JSON.stringify(E.editor.getCursor()), window.__calls]"));
await c.ev2(`const s=app.workspace.editorSuggest.suggests[0]; delete s.selectSuggestion; delete s.__dbg`);
process.exit(0);
