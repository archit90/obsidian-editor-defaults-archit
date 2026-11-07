import { setup, sleep } from "./lib.mjs";
const c = await setup();
const surface = process.argv[2] || "tab";
await c.ev2(`return await E.open(${JSON.stringify(surface)}, "---\\nsrc: \\norg: []\\n---\\nbody")`);
await sleep(800);
for (const key of ["src", "org"]) {
  const r = await c.ev2(
    `const root = E.surface.startsWith("canvas") ? E.cm.dom.ownerDocument : E.view.containerEl; const el=[...(root.querySelectorAll? root.querySelectorAll('.metadata-property[data-property-key="${key}"] .metadata-property-value [contenteditable], .metadata-property[data-property-key="${key}"] .metadata-property-value input'):[])].filter(e=>e.isConnected)[0]; if(!el) return "no field"; el.focus(); return el.tagName+" "+el.className`,
  );
  console.log(key, r);
  if (r === "no field") continue;
  await c.type("[[");
  await c.type("Abstraction delays tru");
  await sleep(900);
  console.log(
    "suggest:",
    await c.ev2(
      `return [...document.querySelectorAll(".suggestion-container.mod-property-value .suggestion-item")].slice(0,2).map(e=>e.textContent)`,
    ),
  );
  await c.key(process.argv[3] || "Enter");
  await sleep(1200);
  await c.ev2(`document.activeElement?.blur?.()`);
  await sleep(1500);
  console.log(
    JSON.stringify(
      await c.ev2(
        `return await app.vault.read(app.vault.getAbstractFileByPath(E.view.file?.path || "_test/ed-card.md"))`,
      ),
    ),
  );
}
process.exit(0);
