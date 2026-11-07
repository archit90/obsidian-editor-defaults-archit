import { setup, sleep } from "./lib.mjs";
const c = await setup();
const s = process.argv[2] || "tab";
const fileOf = `E.view.file?.path || "_test/ed-card.md"`;
const read = () =>
  c.ev2(`return (await app.vault.read(app.vault.getAbstractFileByPath(${fileOf}))).split("---")[1].trim()`);
await c.ev2(
  `return await E.open(${JSON.stringify(s)}, "---\\ncreated: 2026-09-10T09:30:00\\ndue: 2026-11-06\\n---\\nbody")`,
);
await sleep(1000);
const field = k =>
  `[...E.cm.dom.ownerDocument.querySelectorAll('.metadata-property[data-property-key="${k}"] input[data-iso-date]')].filter(e=>e.isConnected && (!E.view.containerEl || E.view.containerEl.contains(e) || E.surface.startsWith("canvas")))[0]`;
async function typeIn(k, text, end = "Enter") {
  await c.ev2(`const el=${field(k)}; el.focus(); el.select(); return 1`);
  await c.key("Backspace");
  await c.type(text);
  await sleep(200);
  const st = await c.ev2(
    `const el=${field(k)}; return {v:el.value, invalid:el.getAttribute("aria-invalid"), outline:el.style.outline}`,
  );
  await c.key(end);
  await sleep(1200);
  return { k, text, end, st, file: await read(), shown: await c.ev2(`return ${field(k)}?.value`) };
}
console.log(await typeIn("due", "06/11/2026"));
console.log(await typeIn("due", "2026-11-07"));
console.log(await typeIn("due", "2026-11-0"));
console.log(await typeIn("due", "2026-12-01", "Escape"));
console.log(await typeIn("created", "2026-11-07 10:00"));
console.log(await typeIn("created", "2026-11-07 10:00:15"));
console.log(await typeIn("created", "2026-11-07T11:00:00"));
console.log(await typeIn("created", "7 Nov 2026"));
console.log(await typeIn("due", ""));
// picker
await c.ev2(
  `const el=${field("created")}; const p=el.parentElement.querySelector(".iso-date-hidden-picker"); p.value="2026-01-02T03:04"; p.dispatchEvent(new Event("change")); return 1`,
);
await sleep(1200);
console.log("picker:", await read(), await c.ev2(`return ${field("created")}.value`));
process.exit(0);
