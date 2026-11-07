import { setup, sleep } from "./lib.mjs";
const c = await setup();
const notices = () => c.ev2(`const docs=[document, app.setting.containerEl.doc].filter((d,i,a)=>d && a.indexOf(d)===i); return docs.flatMap(d=>[...d.querySelectorAll(".notice")].map(n=>(d===document?"main: ":"settings: ")+n.textContent))`);
const clearNotices = () => c.ev2(`[document, app.setting.containerEl.doc].forEach(d=>d?.querySelectorAll(".notice").forEach(n=>n.remove())); return 1`);
const cfg = () => c.ev2(`return E.cfg()`);
// 1. Files and links tab: change New link format and Deleted files with the real dropdowns
await c.ev2(`app.setting.open(); app.setting.openTabById("file"); await E.sleep(500); return 1`);
const dd = await c.ev2(`const sel=[...app.setting.activeTab.containerEl.querySelectorAll("select")]; return sel.map(s=>s.closest(".setting-item")?.querySelector(".setting-item-name")?.textContent+"="+s.value+" ["+[...s.options].map(o=>o.value).join("/")+"]")`);
console.log(dd);
async function setDropdown(name, value) {
  return c.ev2(`const s=[...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.querySelector(".setting-item-name")?.textContent===${JSON.stringify(name)})?.querySelector("select"); if(!s) return "no dropdown"; s.value=${JSON.stringify(value)}; s.dispatchEvent(new Event("change")); return "set"`);
}
await clearNotices();
console.log(await setDropdown("New link format", "shortest"));
await sleep(150); console.log("just after:", (await cfg()).link);
await sleep(800);
console.log("after 1s:", (await cfg()).link, "| dropdown now:", await c.ev2(`return [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.querySelector(".setting-item-name")?.textContent==="New link format")?.querySelector("select")?.value`));
console.log("notices:", await notices());
await clearNotices();
console.log(await setDropdown("Deleted files", "system"));
await sleep(1000); console.log("trash:", (await cfg()).trash, await notices());
await clearNotices();
console.log(await setDropdown("Default location for new attachments", "current"));
await sleep(1000); console.log("att:", (await cfg()).att, await notices());
await clearNotices();
// 2. Core plugins tab: switch Backlinks on, Bases off
await c.ev2(`app.setting.openTabById("plugins"); await E.sleep(500); return 1`);
async function coreToggle(label) {
  return c.ev2(`const it=[...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.querySelector(".setting-item-name")?.textContent===${JSON.stringify(label)}); if(!it) return "no item"; it.querySelector(".checkbox-container").click(); return "clicked"`);
}
console.log("Backlinks:", await coreToggle("Backlinks")); await sleep(1000);
console.log("core:", JSON.stringify((await cfg()).core), await notices(), "toggle shows:", await c.ev2(`return [...app.setting.activeTab.containerEl.querySelectorAll(".setting-item")].find(i=>i.querySelector(".setting-item-name")?.textContent==="Backlinks")?.querySelector(".checkbox-container")?.classList.contains("is-enabled")`));
await clearNotices();
console.log("Bases:", await coreToggle("Bases")); await sleep(1000);
console.log("core:", JSON.stringify((await cfg()).core), await notices());
await clearNotices();
// 3. Hotkeys: remove Alt+N via the API the Hotkeys tab uses, and restore default (removeHotkeys)
await c.ev2(`app.hotkeyManager.setHotkeys("templater-obsidian:create-new-note-from-template",[{modifiers:["Alt"],key:"M"}]); await app.hotkeyManager.save(); return 1`);
await sleep(1000); console.log("hk:", JSON.stringify((await cfg()).hk["templater-obsidian:create-new-note-from-template"]), await notices());
await clearNotices();
await c.ev2(`app.hotkeyManager.removeHotkeys("app:go-back"); await app.hotkeyManager.save(); return 1`);
await sleep(1000); console.log("hk:", JSON.stringify((await cfg()).hk["app:go-back"]), await notices());
await clearNotices();
await c.ev2(`app.setting.close(); return 1`);
console.log("errs", (await c.ev2("return E.errs")).filter(e=>!/MiniSearch/.test(e)));
process.exit(0);
