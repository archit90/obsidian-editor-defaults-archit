import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for the plugin's pure logic. `obsidian` has no runtime outside the app, so tests get a small stub.
export default defineConfig({
  // the bundled settings note (src/vault-settings.md) as a string, as esbuild loads it
  plugins: [
    {
      name: "md-text",
      transform: (code, id) => (id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : null),
    },
  ],
  resolve: {
    alias: { obsidian: fileURLToPath(new URL("./test/obsidian-stub.ts", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
