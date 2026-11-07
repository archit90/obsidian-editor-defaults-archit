// Helpers for driving sandbox 2 (CDP 9312) for Editor Defaults tests.
import { connect } from "../../editor-outliner/e2e/cdp.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGE = String.raw`
(() => {
  const old = window.__ed;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const E = window.__ed = {
    errs: old ? old.errs : [],
    created: old?.created, baseLeaf: old?.baseLeaf,
    sleep,
    async file(p, text = "") {
      let f = app.vault.getAbstractFileByPath(p);
      if (f) await app.vault.modify(f, text); else f = await app.vault.create(p, text);
      return f;
    },
    async routeException(p) {
      const lp = app.plugins.plugins["obsidian-editor-lanes"];
      if (lp && !lp.settings.routeExceptions.split("\n").includes(p)) {
        lp.settings.routeExceptions = (lp.settings.routeExceptions ? lp.settings.routeExceptions + "\n" : "") + p;
        await lp.settingsChanged("routing");
      }
    },
    // surface: tab | lanes | canvas-text | canvas-file ; returns editor (cm) in E.cm, view in E.view
    async open(surface, text = "") {
      E.surface = surface;
      if (surface === "tab" || surface === "lanes") {
        const p = surface === "lanes" ? "_test/ed-lane.md" : "_test/ed-tab.md";
        if (surface === "tab") await E.routeException(p);
        const f = await E.file(p, text);
        const inLane = v => !!v.containerEl.closest(".lane-split");
        let v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(x => x.containerEl.isConnected && x.file?.path === p && inLane(x) === (surface === "lanes"));
        if (!v) {
          if (surface === "lanes") {
            const lanes = app.workspace.getLeavesOfType("editor-lanes")[0];
            if (lanes) app.workspace.setActiveLeaf(lanes, { focus: true });
            await app.workspace.getLeaf(false).openFile(f);
          } else await app.workspace.getLeaf("tab").openFile(f);
          await sleep(800);
          v = app.workspace.getLeavesOfType("markdown").map(l => l.view).find(x => x.containerEl.isConnected && x.file?.path === p && inLane(x) === (surface === "lanes"));
        }
        if (!v) throw new Error("couldn't open " + p + " as " + surface);
        const st = v.getState();
        if (st.mode !== "source") { await v.setState({ ...st, mode: "source", source: false }, { history: false }); await sleep(250); }
        const lanesTab = app.workspace.getLeavesOfType("editor-lanes")[0];
        if (surface === "lanes" && lanesTab) app.workspace.setActiveLeaf(lanesTab, { focus: true });
        app.workspace.setActiveLeaf(v.leaf, { focus: true });
        await sleep(100);
        E.view = v; E.cm = v.editor.cm; E.editor = v.editor;
        v.editor.setValue(text); v.editor.focus(); v.editor.setCursor(v.editor.lastLine(), v.editor.getLine(v.editor.lastLine()).length);
        return { surface, inLane: inLane(v) };
      }
      const cp = "_test/ed.canvas", fp = "_test/ed-card.md";
      await E.file(fp, surface === "canvas-file" ? text : "");
      let leaf = app.workspace.getLeavesOfType("canvas").find(l => l.view.file?.path === cp);
      if (!leaf) {
        const data = { nodes: [
          { id: "t1", type: "text", text: "", x: 0, y: 0, width: 520, height: 520 },
          { id: "f1", type: "file", file: fp, x: 600, y: 0, width: 520, height: 520 } ], edges: [] };
        let f = app.vault.getAbstractFileByPath(cp);
        if (f) await app.vault.modify(f, JSON.stringify(data)); else f = await app.vault.create(cp, JSON.stringify(data));
        await E.routeException(cp);
        leaf = app.workspace.getLeaf("tab");
        await leaf.openFile(f);
        await sleep(1200);
        leaf.view.canvas.zoomToFit();
        await sleep(300);
      }
      app.workspace.setActiveLeaf(leaf, { focus: true });
      const canvas = leaf.view.canvas;
      const node = canvas.nodes.get(surface === "canvas-text" ? "t1" : "f1");
      E.node = node;
      if (!node.isEditing || !node.child?.editor?.cm?.dom.isConnected) {
        canvas.deselectAll(); canvas.selectOnly(node); node.startEditing(); await sleep(800);
      }
      const ed = node.child.editor;
      E.cm = ed.cm; E.editor = ed; E.view = node.child;
      if (ed.getValue() !== text) ed.setValue(text);
      ed.focus(); ed.setCursor(ed.lastLine(), ed.getLine(ed.lastLine()).length);
      return { surface, inIframe: ed.cm.dom.ownerDocument !== document };
    },
    text() { return E.editor.getValue(); },
    suggestOpen() { return !!app.workspace.editorSuggest.currentSuggest; },
    cfg() {
      return {
        link: app.vault.getConfig("newLinkFormat"), att: app.vault.getConfig("attachmentFolderPath"), trash: app.vault.getConfig("trashOption"),
        core: Object.fromEntries(["bases", "templates", "zk-prefixer", "backlink"].map(k => [k, app.internalPlugins.plugins[k]?.enabled])),
        hk: Object.fromEntries(["app:go-back", "app:go-forward", "templater-obsidian:create-new-note-from-template", "templater-obsidian:insert-templater"].map(i => [i, app.hotkeyManager.getHotkeys(i)])),
      };
    },
  };
  if (old) return 1;
  const ce = console.error.bind(console);
  console.error = (...a) => { E.errs.push(a.map(x => x?.stack || String(x)).join(" ")); ce(...a); };
  window.addEventListener("error", e => E.errs.push("uncaught " + e.message));
  window.addEventListener("unhandledrejection", e => E.errs.push("rejection " + (e.reason?.stack || e.reason)));
  return 1;
})()`;

export async function setup(port = 9312) {
  const c = await connect(port);
  await c.ev(PAGE);
  c.ev2 = body => c.ev(`(async()=>{const E=window.__ed; ${body}})()`);
  c.click = async (x, y) => {
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    for (const type of ["mousePressed", "mouseReleased"])
      await c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };
  return c;
}
