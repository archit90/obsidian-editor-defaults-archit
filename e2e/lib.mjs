// Helpers for driving a sandbox's Obsidian (e2e/sandbox.sh) in the Editor Defaults (Archit) tests. setup() connects
// (CDP_PORT, default: cdp.mjs's, this plugin's sandbox 2), refuses anything but a sandbox vault, and installs the
// page helpers below as window.__ed.
import fs from "node:fs";
import { assertSandboxVault, connect } from "./cdp.mjs";
import { NOTES, PATHS, TYPES } from "./fixtures.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** What the plugin enforces: the file the plugin itself reads. */
export const DEFAULTS = JSON.parse(fs.readFileSync(new URL("../src/defaults.json", import.meta.url), "utf8"));
export const PLUGIN_ID = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8")).id;

/** The page side (window.__ed), evaluated in Obsidian with the fixtures and defaults in `ctx`. */
function page(ctx) {
  const { NOTES, PATHS, TYPES, DEFAULTS } = ctx;
  const old = window.__ed;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const E = (window.__ed = {
    errs: old ? old.errs : [],
    created: old?.created,
    baseLeaf: old?.baseLeaf,
    // states to put back at the end: core plugins the suite turned on, Editor Multiple Lanes' routing exceptions
    coreBefore: old?.coreBefore ?? {},
    lanesSaved: old?.lanesSaved,
    sleep,
    /** Creates the folders of `dir` that are missing. */
    async folder(dir) {
      let p = "";
      for (const part of dir.split("/").filter(Boolean)) {
        p = p ? `${p}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(p)) await app.vault.createFolder(p).catch(() => {});
      }
    },
    /** The note at `p` holding exactly `text` (made, with its folders, when missing). */
    async file(p, text = "") {
      await E.folder(p.split("/").slice(0, -1).join("/"));
      const f = app.vault.getAbstractFileByPath(p);
      if (!f) return app.vault.create(p, text);
      if ((await app.vault.read(f)) !== text) await app.vault.modify(f, text);
      return f;
    },
    /** The fixtures (fixtures.mjs) and the core plugins the cases use, whatever the vault: idempotent. */
    async prepare() {
      for (const [p, text] of Object.entries(NOTES)) await E.file(p, text);
      await E.folder(PATHS.tabFolder);
      await E.folder(PATHS.newNotes);
      const m = app.metadataTypeManager;
      for (const [k, t] of Object.entries(TYPES)) if (m.getAssignedWidget(k) !== t) await m.setType(k, t);
      for (const id of ["canvas", "properties", "file-explorer"]) {
        const p = app.internalPlugins.plugins[id];
        if (p && !p.enabled) {
          if (!(id in E.coreBefore)) E.coreBefore[id] = false;
          await p.enable(true);
        }
      }
      // a simulated plugin left by an interrupted run
      for (const [id, p] of Object.entries(app.plugins.plugins))
        if (p?.simulatedByEditorDefaultsTests) delete app.plugins.plugins[id];
      return 1;
    },
    /** Puts back the core plugins prepare() turned on. */
    async restoreCore() {
      for (const [id, was] of Object.entries(E.coreBefore))
        if (!was) await app.internalPlugins.plugins[id]?.disable(true);
      E.coreBefore = {};
      return 1;
    },
    /** Loaded plugins: community plugin ids (simulated ones left out) and core:<id> for enabled core plugins. */
    loadedIds() {
      const community = Object.keys(app.plugins.plugins).filter(
        id => !app.plugins.plugins[id]?.simulatedByEditorDefaultsTests,
      );
      const core = Object.keys(app.internalPlugins.plugins).filter(id => app.internalPlugins.plugins[id].enabled);
      return [...community, ...core.map(id => `core:${id}`)];
    },
    /**
     * Stands in for a community plugin that isn't installed: Editor Defaults only looks whether one is loaded
     * (app.plugins.plugins). Returns false, and does nothing, when the real one is there.
     */
    simulate(id) {
      if (app.plugins.plugins[id]) return false;
      app.plugins.plugins[id] = { simulatedByEditorDefaultsTests: true, manifest: { id, name: `${id} (simulated)` } };
      return true;
    },
    unsimulate(id) {
      if (app.plugins.plugins[id]?.simulatedByEditorDefaultsTests) delete app.plugins.plugins[id];
      return 1;
    },
    lanes() {
      return app.plugins.plugins["editor-multiple-lanes"];
    },
    /**
     * Editor Multiple Lanes, when loaded, opens notes in lanes: one routing exception (its test API: settings.
     * routeExceptions, then settingsChanged("routing")) keeps the "tab" cases' folder in normal tabs. Its value is
     * saved first and put back by lanesEnd(). Does nothing without Lanes.
     */
    async lanesBegin() {
      const lp = E.lanes();
      if (!lp) return false;
      if (E.lanesSaved === undefined) E.lanesSaved = lp.settings.routeExceptions;
      const lines = String(lp.settings.routeExceptions ?? "").split("\n");
      if (!lines.includes(PATHS.tabFolder)) {
        lp.settings.routeExceptions = [...lines.filter(l => l.trim()), PATHS.tabFolder].join("\n");
        await lp.settingsChanged("routing");
      }
      return true;
    },
    async lanesEnd() {
      const lp = E.lanes();
      if (!lp || E.lanesSaved === undefined) return false;
      lp.settings.routeExceptions = E.lanesSaved;
      E.lanesSaved = undefined;
      await lp.settingsChanged("routing");
      return true;
    },
    /** Whether a note view is a card in a lanes tab (Lanes' test API: inside .lanes-view). */
    inLanes(v) {
      return !!v.containerEl.closest(".lanes-view");
    },
    // surface: tab | lanes | canvas-text | canvas-file; sets the editor in E.editor (E.cm its CodeMirror), the view in E.view
    async open(surface, text = "") {
      E.surface = surface;
      if (surface === "tab" || surface === "lanes") {
        const p = surface === "lanes" ? PATHS.lane : PATHS.tab;
        const f = await E.file(p, text);
        const find = () =>
          app.workspace
            .getLeavesOfType("markdown")
            .map(l => l.view)
            .find(x => x.containerEl.isConnected && x.file?.path === p && E.inLanes(x) === (surface === "lanes"));
        let v = find();
        if (!v) {
          if (surface === "lanes") {
            const lanes = app.workspace.getLeavesOfType("editor-lanes")[0];
            if (lanes) app.workspace.setActiveLeaf(lanes, { focus: true });
            await app.workspace.getLeaf(false).openFile(f);
          } else await app.workspace.getLeaf("tab").openFile(f);
          await sleep(800);
          v = find();
        }
        if (!v) throw new Error(`couldn't open ${p} as ${surface}`);
        const st = v.getState();
        // Live Preview
        if (st.mode !== "source" || st.source) {
          await v.setState({ ...st, mode: "source", source: false }, { history: false });
          await sleep(250);
        }
        const lanesTab = app.workspace.getLeavesOfType("editor-lanes")[0];
        if (surface === "lanes" && lanesTab) app.workspace.setActiveLeaf(lanesTab, { focus: true });
        app.workspace.setActiveLeaf(v.leaf, { focus: true });
        await sleep(100);
        E.view = v;
        E.cm = v.editor.cm;
        E.editor = v.editor;
        v.editor.setValue(text);
        v.editor.setCursor(v.editor.lastLine(), v.editor.getLine(v.editor.lastLine()).length);
        await E.focusEditor(v.leaf);
        return { surface, inLanes: E.inLanes(v) };
      }
      const cp = PATHS.canvas;
      const fp = PATHS.card;
      await E.file(fp, surface === "canvas-file" ? text : "");
      let leaf = app.workspace.getLeavesOfType("canvas").find(l => l.view.file?.path === cp);
      if (!leaf) {
        const data = {
          nodes: [
            { id: "t1", type: "text", text: "", x: 0, y: 0, width: 520, height: 520 },
            { id: "f1", type: "file", file: fp, x: 600, y: 0, width: 520, height: 520 },
          ],
          edges: [],
        };
        const f = await E.file(cp, JSON.stringify(data));
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
        canvas.deselectAll();
        canvas.selectOnly(node);
        node.startEditing();
        await sleep(800);
      }
      const ed = node.child.editor;
      E.cm = ed.cm;
      E.editor = ed;
      E.view = node.child;
      if (ed.getValue() !== text) ed.setValue(text);
      ed.setCursor(ed.lastLine(), ed.getLine(ed.lastLine()).length);
      await E.focusEditor(leaf);
      return { surface, inIframe: ed.cm.dom.ownerDocument !== document };
    },
    /** Gives E.editor the focus and waits until it has it: another plugin may take it while a view redraws. */
    async focusEditor(leaf) {
      for (let i = 0; i < 15 && !E.cm.hasFocus; i++) {
        if (leaf && app.workspace.activeLeaf !== leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
        E.editor.focus();
        await sleep(100);
      }
      return E.cm.hasFocus;
    },
    text() {
      return E.editor.getValue();
    },
    suggestOpen() {
      return !!app.workspace.editorSuggest.currentSuggest;
    },
    /** The vault's state for everything Editor Defaults enforces (defaults.json), and the loaded plugins. */
    cfg() {
      return {
        link: app.vault.getConfig("newLinkFormat"),
        att: app.vault.getConfig("attachmentFolderPath"),
        trash: app.vault.getConfig("trashOption"),
        core: Object.fromEntries(DEFAULTS.corePlugins.map(r => [r.id, app.internalPlugins.plugins[r.id]?.enabled])),
        hk: Object.fromEntries(DEFAULTS.hotkeys.map(h => [h.command, app.hotkeyManager.getHotkeys(h.command)])),
        loaded: Object.keys(app.plugins.plugins),
      };
    },
  });
  if (old) return 1;
  const ce = console.error.bind(console);
  console.error = (...a) => {
    E.errs.push(a.map(x => x?.stack || String(x)).join(" "));
    ce(...a);
  };
  window.addEventListener("error", e => E.errs.push(`uncaught ${e.message}`));
  window.addEventListener("unhandledrejection", e => E.errs.push(`rejection ${e.reason?.stack || e.reason}`));
  return 1;
}

export async function setup(port = process.env.CDP_PORT) {
  const c = await connect(port || undefined);
  await assertSandboxVault(c);
  await c.ev(`(${page.toString()})(${JSON.stringify({ NOTES, PATHS, TYPES, DEFAULTS })})`);
  c.ev2 = body => c.ev(`(async()=>{const E=window.__ed; ${body}})()`);
  c.click = async (x, y) => {
    await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    for (const type of ["mousePressed", "mouseReleased"])
      await c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  };
  return c;
}
