// Typing rules for the plugin's source (SPEC.md, Development): no untyped code, and no `any` or lint / type-check
// escape without a documented reason. ESLint fails a bare `any` (no-explicit-any) and a `@ts-expect-error`
// without a description (ban-ts-comment); this test adds what ESLint can't check: every eslint-disable
// directive names its rules and gives a reason after `--`.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(p) : e.name.endsWith(".ts") ? [p] : [];
  });
}

const DIRECTIVE = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b(.*)$/;
const MIN_REASON = 10;

describe("typing", () => {
  const files = tsFiles(path.join(ROOT, "src"));

  it("has TypeScript sources", () => expect(files.length).toBeGreaterThan(0));

  it("documents every eslint-disable with the rules it turns off and a reason after --", () => {
    const bad: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const m = DIRECTIVE.exec(line);
          if (!m) return;
          const [rules, reason] = m[1].replace(/\*\/\s*$/, "").split(/\s--\s?/, 2);
          if (!rules.trim() || (reason ?? "").trim().length < MIN_REASON)
            bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it("never uses @ts-ignore or @ts-nocheck", () => {
    const bad = files.flatMap(f =>
      fs
        .readFileSync(f, "utf8")
        .split("\n")
        .flatMap((l, i) => (/@ts-(ignore|nocheck)\b/.test(l) ? [`${path.relative(ROOT, f)}:${i + 1}`] : [])),
    );
    expect(bad).toEqual([]);
  });
});
