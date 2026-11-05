import esbuild from "esbuild";
const watch = process.argv[2] === "watch";
const ctx = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2018",
  platform: "browser",
  outfile: "main.js",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});
if (watch) await ctx.watch(); else { await ctx.rebuild(); await ctx.dispose(); }
