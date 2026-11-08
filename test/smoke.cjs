// Loads the built main.js with a stub `obsidian` module and checks it exports a Plugin subclass with
// onload: catches bundling / import-order mistakes that type-checking can't. Run: node test/smoke.cjs
const Module = require("module");
const path = require("path");
class Base {}
const stub = new Proxy(
  { Plugin: class Plugin extends Base {}, debounce: f => Object.assign(f, { cancel() {}, run() {} }) },
  { get: (t, k) => (k in t ? t[k] : class Stub extends Base {}) },
);
const load = Module._load;
Module._load = function (req, ...rest) {
  if (req === "obsidian") return stub;
  // Obsidian provides this one at runtime; it isn't installed here.
  if (req === "@codemirror/language") return new Proxy({}, { get: () => ({}) });
  return load.call(this, req, ...rest);
};
try {
  const mod = require(path.join(__dirname, "..", "main.js"));
  const P = mod.default ?? mod;
  if (typeof P !== "function" || typeof P.prototype.onload !== "function")
    throw new Error("no Plugin class with onload");
  console.log("ok   main.js");
} catch (e) {
  console.log(`FAIL main.js: ${e.message}`);
  process.exit(1);
}
