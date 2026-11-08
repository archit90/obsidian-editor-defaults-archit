// Minimal Chrome DevTools Protocol client for a running Obsidian started with --remote-debugging-port.
// connect() picks the first app://obsidian.md page on CDP_PORT and returns
//   ev(expr)            evaluate in the page (awaits promises, returns the JSON value)
//   key(name, mods)     a real key press (keyDown + keyUp); mods {shift, ctrl, alt, meta}
//   type(text)          insert text as typing (Input.insertText)
//   send(method, params) any raw CDP method; on(method, fn) its events
// connect(port, pick) takes the first page target pick(target) accepts: by default the main window, never a popout
// window (its url has "popout"); assertSandboxVault(c) refuses any vault but a sandbox's (see below)
// CLI: node e2e/cdp.mjs '<js expression>' (CDP_PORT, default 9312: this plugin's sandbox 2, e2e/sandbox.sh)
//
// Typing: checked with // @ts-check and JSDoc. The one `any` is the DevTools protocol's own JSON (CdpJson): its
// shape differs per method and per event, and callers read the fields of the method they called.
// @ts-check

/**
 * Raw DevTools protocol JSON (a response's result, an event's params, an evaluated value).
 * @typedef {any} CdpJson
 */
/** @typedef {{ id?: number, method?: string, params?: CdpJson, result?: CdpJson, error?: CdpJson }} CdpMessage */
/** @typedef {{ type: string, url: string, title: string, webSocketDebuggerUrl: string }} CdpTarget */
/** @typedef {{ shift?: boolean, ctrl?: boolean, alt?: boolean, meta?: boolean }} Mods */

const PORT = process.env.CDP_PORT || 9312;

/**
 * @param {string | number} port
 * @param {(t: CdpTarget) => boolean} pick
 */
export async function connect(
  port = PORT,
  pick = t => t.url.startsWith("app://obsidian.md/index.html") && !t.url.includes("popout"),
) {
  /** @type {CdpTarget[]} */
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const page = list.find(t => t.type === "page" && pick(t));
  if (!page) throw new Error("no Obsidian page target on port " + port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  /** @type {Map<number, { res: (d: CdpMessage) => void, rej: (e: Error) => void }>} */
  const pending = new Map();
  // Obsidian closing or crashing fails every call still waiting, instead of hanging the runner
  /** @type {Error | null} */
  let closed = null;
  const failAll = (/** @type {Error} */ e) => {
    closed = e;
    for (const p of pending.values()) p.rej(e);
    pending.clear();
  };
  ws.onclose = () => failAll(new Error("CDP connection closed (Obsidian quit or restarted?)"));
  /** @type {Map<string, ((params: CdpJson) => void)[]>} */
  const listeners = new Map();
  ws.onmessage = m => {
    /** @type {CdpMessage} */
    const d = JSON.parse(String(m.data));
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)?.res(d);
      pending.delete(d.id);
    } else if (d.method) for (const fn of listeners.get(d.method) || []) fn(d.params);
  };
  // on(method, fn): CDP events (after enabling their domain, e.g. send("Runtime.enable"))
  /** @type {(method: string, fn: (params: CdpJson) => void) => void} */
  const on = (method, fn) => void listeners.set(method, [...(listeners.get(method) || []), fn]);
  // a call that gets no answer within CDP_TIMEOUT_MS (default 10 minutes: some cases evaluate for long) fails
  const timeout = Number(process.env.CDP_TIMEOUT_MS) || 600000;
  /** @type {(method: string, params?: object) => Promise<CdpMessage>} */
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      if (closed) return rej(closed);
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        rej(new Error(`CDP ${method} got no answer in ${timeout} ms`));
      }, timeout);
      pending.set(i, {
        res: d => (clearTimeout(timer), res(d)),
        rej: e => (clearTimeout(timer), rej(e)),
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  /** @type {(expr: string) => Promise<CdpJson>} */
  const ev = async expr => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.result?.exceptionDetails)
      throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
    if (r.error) throw new Error(JSON.stringify(r.error));
    return r.result?.result?.value;
  };
  // name: [keyCode, text, code]
  /** @type {Record<string, [number, string, string?]>} */
  const KEYS = {
    Enter: [13, "\r"],
    Backspace: [8, ""],
    Delete: [46, ""],
    Tab: [9, ""],
    Escape: [27, ""],
    Space: [32, " ", "Space"],
    ArrowUp: [38, ""],
    ArrowDown: [40, ""],
    ArrowLeft: [37, ""],
    ArrowRight: [39, ""],
    Home: [36, ""],
    End: [35, ""],
    PageUp: [33, ""],
    PageDown: [34, ""],
  };
  /** @type {(k: string, mods?: Mods) => Promise<void>} */
  const key = async (k, mods = {}) => {
    const m = (mods.alt ? 1 : 0) | (mods.ctrl ? 2 : 0) | (mods.meta ? 4 : 0) | (mods.shift ? 8 : 0);
    let code,
      text,
      keyName = k,
      codeName;
    if (KEYS[k]) {
      [code, text, codeName] = KEYS[k];
      codeName ??= k;
      if (k === "Space") keyName = " ";
    } else {
      code = k.toUpperCase().charCodeAt(0);
      text = mods.shift ? k.toUpperCase() : k;
      keyName = text;
      codeName = /[a-z]/i.test(k) ? "Key" + k.toUpperCase() : /[0-9]/.test(k) ? "Digit" + k : undefined;
    }
    const plain = !(mods.ctrl || mods.alt || mods.meta) && text;
    await send("Input.dispatchKeyEvent", {
      type: plain ? "keyDown" : "rawKeyDown",
      modifiers: m,
      key: keyName,
      code: codeName,
      windowsVirtualKeyCode: code,
      text: plain ? text : undefined,
      unmodifiedText: plain ? text : undefined,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      modifiers: m,
      key: keyName,
      code: codeName,
      windowsVirtualKeyCode: code,
    });
  };
  /** @type {(s: string) => Promise<void>} */
  const type = async s => {
    await send("Input.insertText", { text: s });
  };
  return { send, ev, key, type, on, close: () => ws.close() };
}

/**
 * Throws unless the connected Obsidian has a sandbox vault open (its path has a `.sandbox…` folder in it, as
 * e2e/sandbox.sh makes), so a suite that writes fixtures and edits notes never runs against a real vault through a
 * wrong port. E2E_ALLOW_VAULT=<path> allows that one other vault. Returns the vault's path.
 * @param {{ ev: (expr: string) => Promise<CdpJson> }} c
 * @returns {Promise<string>}
 */
export async function assertSandboxVault(c) {
  const base = await c.ev(`app.vault.adapter.basePath`);
  if (typeof base === "string" && (/[\\/]\.sandbox[^\\/]*[\\/]/.test(base) || base === process.env.E2E_ALLOW_VAULT))
    return base;
  throw new Error(
    `refusing to run: the Obsidian on this port has ${base} open, not a sandbox vault (e2e/sandbox.sh); ` +
      `set E2E_ALLOW_VAULT=${base} to allow it`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const c = await connect();
  try {
    console.log(JSON.stringify(await c.ev(process.argv[2] ?? ""), null, 1));
  } finally {
    c.close();
  }
}
