import { setup, sleep } from "./lib.mjs";
const c = await setup();
const hash = async () => {
  await c.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "#",
    code: "Digit3",
    modifiers: 8,
    windowsVirtualKeyCode: 51,
    text: "#",
    unmodifiedText: "3",
  });
  await c.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "#",
    code: "Digit3",
    modifiers: 8,
    windowsVirtualKeyCode: 51,
  });
};
await c.ev2(`return await E.open("tab", "see ")`);
await c.type("[[");
await c.type("Outliner test - Head");
await sleep(700);
await hash();
await sleep(700);
console.log(JSON.stringify(await c.ev2("return E.text()")));
await c.type("Goa");
await sleep(700);
console.log(
  await c.ev2(
    `const s=app.workspace.editorSuggest.currentSuggest; return s? s.suggestions.values.slice(0,2).map(v=>JSON.stringify({type:v.type,path:v.file?.path,h:v.heading,sub:v.subpath, keys:Object.keys(v)})):null`,
  ),
);
await c.key("Enter");
await sleep(400);
console.log(JSON.stringify(await c.ev2("return E.text()")));
process.exit(0);
