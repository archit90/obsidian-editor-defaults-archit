// Lint rules (ESLint flat config + typescript-eslint, formatting left to Prettier).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // e2e scripts (Node runners and page-side snippets evaluated in Obsidian over CDP) aren't plugin code
  { ignores: ["**/node_modules/**", "**/main.js", "**/*.mjs", "**/*.cjs", "**/e2e/**/*.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    rules: {
      // No `any`: Obsidian internals get types in src/types/*.d.ts (or `unknown` and narrowing). Where `any` is
      // unavoidable, an `eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>` documents why;
      // test/typing.test.ts fails a directive without a reason.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "@typescript-eslint/no-this-alias": ["error", { allowedNames: ["self", "plugin"] }],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      eqeqeq: ["error", "smart"],
    },
  },
);
