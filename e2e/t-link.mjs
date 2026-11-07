import { setup, sleep } from "./lib.mjs";
const c = await setup();
for (const s of (process.argv[2]||"tab,lanes,canvas-text,canvas-file").split(",")) {
  const info = await c.ev2(`return await E.open(${JSON.stringify(s)}, "see ")`);
  await c.type("[[");
  await c.type("Abstraction delays tru");
  await sleep(700);
  const open = await c.ev2("return E.suggestOpen()");
  await c.key("Enter");
  await sleep(300);
  console.log(s, JSON.stringify(info), "suggest:", open, "->", JSON.stringify(await c.ev2("return E.text()")));
}
console.log("errs", await c.ev2("return E.errs"));
process.exit(0);
