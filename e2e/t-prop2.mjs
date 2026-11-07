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
for (const surface of (process.argv[2] || "tab,lanes,canvas-file").split(",")) {
  await c.ev2(`return await E.open(${JSON.stringify(surface)}, "---\\nsrc: \\norg: []\\n---\\nbody")`);
  await sleep(900);
  for (const key of ["src", "org"]) {
    const r = await c.ev2(
      `const doc=E.cm.dom.ownerDocument; const el=[...doc.querySelectorAll('.metadata-property[data-property-key="${key}"] .metadata-property-value [contenteditable]')].filter(e=>e.isConnected && (E.surface.startsWith("canvas") || E.view.containerEl.contains(e)))[0]; if(!el) return "no field"; el.focus(); return "ok"`,
    );
    if (r !== "ok") {
      console.log(surface, key, r);
      continue;
    }
    await c.type("[[");
    await c.type("Outliner test - Head");
    await sleep(900);
    await hash();
    await sleep(700);
    const mid = await c.ev2(`return E.cm.dom.ownerDocument.activeElement?.textContent`);
    await c.type("Goa");
    await sleep(900);
    await c.key("Enter");
    await sleep(1200);
    await c.ev2(`E.cm.dom.ownerDocument.activeElement?.blur?.()`);
    await sleep(1300);
    const fm = await c.ev2(
      `return (await app.vault.read(app.vault.getAbstractFileByPath(E.view.file?.path || "_test/ed-card.md"))).split("---")[1]`,
    );
    console.log(surface, key, "after #:", JSON.stringify(mid), "->", JSON.stringify(fm));
  }
}
process.exit(0);
