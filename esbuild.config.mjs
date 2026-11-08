// esbuild setup: `node esbuild.config.mjs` builds src/main.ts into main.js;
// add `watch` for a rebuild-on-save dev build with an inline source map.
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const watch = process.argv[2] === "watch";
const banner = `/*
GENERATED FILE, built by esbuild from src/. Edit the TypeScript sources, not this file.
*/
`;

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  outfile: "main.js",
  // Not minified: readable stack traces in the dev console matter more than size for local plugins.
  sourcemap: watch ? "inline" : false,
  treeShaking: true,
  logLevel: "info",
});
if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
