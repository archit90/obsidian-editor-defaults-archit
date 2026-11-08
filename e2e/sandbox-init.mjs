// Run by e2e/sandbox.sh once a sandbox's Obsidian is up: trust the vault's plugins (first open of the copy),
// close the settings window that follows, and size the window to the virtual screen.
// Usage: node e2e/sandbox-init.mjs <cdp-port>
import { connect } from "./cdp.mjs";

const c = await connect(process.argv[2]);
// the page exists before Obsidian's app object does: wait for it
for (let i = 0; i < 120; i++) {
  if (await c.ev(`typeof app !== "undefined" && !!app.workspace`)) break;
  await new Promise(r => setTimeout(r, 500));
}
await c.ev(`(async () => {
  for (let i = 0; i < 30; i++) {
    const b = [...document.querySelectorAll("button")].find(b => /Trust author/.test(b.textContent));
    if (b) { b.click(); break; }
    if (app.workspace.layoutReady && app.plugins?.enabledPlugins?.size && Object.keys(app.plugins.plugins).length) break;
    await new Promise(r => setTimeout(r, 500));
  }
  // trusting opens Settings (its own window in 1.15) a moment later: close it once it shows, for up to 10 s
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const open = app.setting?.containerEl?.isConnected || app.setting?.win?.closed === false;
    if (open) { app.setting.close(); await new Promise(r => setTimeout(r, 500)); if (!app.setting?.containerEl?.isConnected) break; }
  }
  return 1;
})()`);
await c.ev(`(async () => {
  const remote = require("electron").remote || require("@electron/remote");
  remote.getCurrentWindow().setBounds({ x: 0, y: 0, width: 1600, height: 1000 });
  await new Promise(r => setTimeout(r, 800));
  return 1;
})()`);
console.log(
  await c.ev(`JSON.stringify({ plugins: Object.keys(app.plugins.plugins).length, w: innerWidth, h: innerHeight })`),
);
process.exit(0);
