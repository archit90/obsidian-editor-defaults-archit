// Run by e2e/sandbox.sh once a sandbox's Obsidian is up: trust the vault's plugins (first open of the copy),
// close the settings window that follows, size the window to the virtual screen, and wait until the plugin under
// test has loaded. Fails (exit 1) if Obsidian stays in restricted mode or the plugin doesn't load.
// Usage: node e2e/sandbox-init.mjs <cdp-port> [<plugin-id>]
import { connect } from "./cdp.mjs";

const [port, id] = process.argv.slice(2);
const c = await connect(port);
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
// the plugins load after the layout: wait for the one under test (30 s)
const state = await c.ev(`(async () => {
  for (let i = 0; i < 60; i++) {
    const restricted = typeof app.plugins.isEnabled === "function" && !app.plugins.isEnabled();
    const loaded = ${JSON.stringify(id ?? "")} === "" || !!app.plugins.plugins[${JSON.stringify(id ?? "")}];
    if (restricted || (app.workspace.layoutReady && loaded)) return { restricted, loaded };
    await new Promise(r => setTimeout(r, 500));
  }
  return { restricted: false, loaded: false };
})()`);
const info = await c.ev(`JSON.stringify({ plugins: Object.keys(app.plugins.plugins), w: innerWidth, h: innerHeight })`);
console.log(info);
if (state.restricted) {
  console.error("Obsidian is in restricted mode: community plugins are off in this sandbox");
  process.exit(1);
}
if (!state.loaded) {
  console.error(`${id} didn't load (see Settings → Community plugins, or the sandbox's obs.log)`);
  process.exit(1);
}
process.exit(0);
