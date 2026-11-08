# Editor Defaults (Archit): specification

This document describes the plugin as it is now; `README.md` is the user guide and `TEST-CASES.md` the test
catalogue. **Keeping this current:** every change updates this document in the same commit. There is no change
log: git history has the past, this document the present.

Plugin id `editor-defaults-archit` (until 2026-11-08 `obsidian-editor-defaults`, display name Editor Defaults); repo `archit90/obsidian-editor-defaults-archit`. A personal plugin: it enforces the settings of the author's note system, and is published only so BRAT can install it.

Enforces vault settings on every device, on load and whenever they drift. Each item has an on/off setting,
all on by default. While one is on, a change made in Obsidian's settings, by a synced `app.json` /
`hotkeys.json` or by another plugin is put back about 0.3 s later, with a notice naming the Editor Defaults (Archit)
setting to turn off for changing it, and an open Settings tab is redrawn (the Hotkeys tab keeps its filter).
Load is silent. If something keeps undoing one item, it is put back at most 5 times in 10 s, then left alone
(console warning) until that window passes. `core-plugins.json` changed on disk is applied at the next start
(Obsidian doesn't reload it while running). Settings read from `data.json` are validated before use.

| Setting                                | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New links use path from vault root     | "New link format" = Absolute path in vault. Heading and block links picked from the `[[` dropdown get the full path too (Obsidian keeps the note name as typed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Insert `[[path]]` without alias        | Picking a note from the `[[` dropdown, in the editor or in a property field, inserts `[[path]]`, not `[[path\|name]]`, however the pick is taken (Enter, Tab, click, or `#` / `^` to go on to a heading or block). Only the alias Obsidian adds itself (the note name) is removed; an alias you typed, or one of the note's aliases you picked, stays. Works with absolute and relative link formats.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Keep attachments in one folder         | "Default location for new attachments" = the folder below (`u`), applied when the field loses focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Deleted files go to the Obsidian trash | "Deleted files" = Move to Obsidian trash (`.trash`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Enforce core plugins                   | Bases on; Templates, Unique note creator and Backlinks off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Enforce hotkeys                        | Exactly these hotkeys (a custom hotkey replaces a command's defaults, so defaults are listed too): Navigate back Mod+Alt+← and Mod+[; Navigate forward Mod+Alt+→ and Mod+]; Templater "Create new note from template" Alt+N; Templater "Open insert template modal" none (written as `[]` even when `hotkeys.json` had no entry for it). Written to `hotkeys.json`. When another command has one of these hotkeys (its own or its default; Mod is Ctrl, Cmd on macOS), a notice names it and points to Settings → Hotkeys, at load and when hotkeys change, once per clash per session; that hotkey is left alone.                                                                                                                                                                                                                         |
| Dates in properties as YYYY-MM-DD      | Date properties show and take `YYYY-MM-DD`, Date & time properties `YYYY-MM-DD HH:mm:ss`, instead of the system's locale format. The note keeps Obsidian's stored format (`YYYY-MM-DDTHH:mm:ss`), which Dataview and Bases read. Text that isn't strictly that format is outlined red while you type; when you leave the field it isn't saved, the field goes back to the stored value, and a notice says the text wasn't a valid date. A calendar button (keyboard-accessible) opens the native picker and writes ISO back; a time picked without seconds gets `:00`. Turning the setting (or the plugin) on or off redraws the date fields of open notes, cards, the File properties view and Bases tabs at once (Bases embedded in a note: on reopening). After a value is saved, the field shows it as stored (`YYYY-MM-DD HH:mm:ss`). |

## Working with other plugins

TODO (filled in from the cross-plugin review).

## Development

- **Repository:** this folder is the whole repo. `package.json` (scripts and tool versions), `tsconfig.json`
  (strict, `noImplicitOverride`, `noUnusedLocals`), `eslint.config.mjs`, `.prettierrc`, `.editorconfig`,
  `.gitattributes`, `esbuild.config.mjs` (`src/main.ts` → `main.js`, not minified; `npm run dev` rebuilds on save
  with an inline source map) and `vitest.config.mts`. `main.js` is built, never committed.
- **`npm run check`:** format check, lint, typecheck, unit tests (vitest, including `test/typing.test.ts`), build,
  and a smoke load of the bundle (`test/smoke.cjs`, with stubs for `obsidian` and `@codemirror/language`). It must
  pass before a commit or a release; CI (`.github/workflows/ci.yml`) runs it on every push.
- **Typing:** no untyped code. `noImplicitAny` (strict) in TypeScript; ESLint fails any explicit `any` (tests
  included) and `@ts-ignore` / `@ts-nocheck` / an undescribed `@ts-expect-error`. Obsidian internals are typed
  in `src/types/*.d.ts` or taken as `unknown` and narrowed. An `any` that can't be avoided carries
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>`; `test/typing.test.ts` fails
  any `eslint-disable` without its rules and a reason after `--`.
- **Code layout:** source in `src/` modules, with the pure logic kept free of Obsidian imports so it can be
  unit-tested (`test/obsidian-stub.ts` stands in for `obsidian`). Patches of Obsidian methods use
  `monkey-around` and are registered with the plugin, so they come off on unload.
- **Internals:** every Obsidian internal used was checked against Obsidian 1.15.0's `app.js` and `app.css`.
  `minAppVersion` is 1.15.0. A new Obsidian version means re-checking them.
- **Versions and releases:** `npm version patch|minor|major` bumps `package.json`, then `scripts/version-bump.mjs`
  copies the version into `manifest.json` and `versions.json`; npm commits and tags it (tag = the version, no
  `v`, `.npmrc`). `git push --follow-tags` runs `.github/workflows/release.yml`: `npm run check`, a check that the
  tag is the manifest version, then a GitHub release with `main.js`, `manifest.json` and `styles.css`, which BRAT
  installs. `isDesktopOnly` is false.
- **Trying a build in a vault:** `npm run deploy -- <vault> …` (or `OBSIDIAN_VAULTS`) builds and copies `main.js`,
  `manifest.json` and `styles.css` into each vault that already has the plugin (`--install` adds it); `data.json`
  is never touched. Reload the plugin in Obsidian afterwards.
- **End-to-end tests:** `e2e/sandbox.sh start|stop|restart|reset|deploy|shot <n>` runs a throwaway Obsidian
  (`OBS_APP`, default the 1.15.0 AppImage) on its own Xvfb display `:110+n` (never on your screen), with its own
  profile, its own vault in `.sandbox/sb<n>/` (git-ignored) and the DevTools port `9310+n`. The vault is a fresh
  empty one with only this plugin, plus any built plugins in `OBS_PLUGINS` (folders separated by `:`) to test them
  together; or a copy of `OBS_VAULT` (e.g. a big test vault). Every start installs the current build. The suite
  in `e2e/` drives it over the DevTools protocol (`e2e/cdp.mjs`) with real key and mouse input. Needs Xvfb, rsync,
  curl, node and ImageMagick.

## Verification status

- **Editor Defaults (Archit), checked in a test Obsidian:** `custom-plugins/editor-defaults/TEST-CASES.md` (runner
  `e2e/run.mjs`), 71 automated
  cases plus a restart and a fresh vault: putting back drifted settings, core plugins and hotkeys (from Settings
  and from disk), hotkey clash warnings; Alt+N / Ctrl+[ / Ctrl+] in tabs, lanes and Canvas cards; `[[` picks with
  Enter / Tab / click / # / ^ in the editor and property fields; ISO date fields (and the revert of invalid text)
  in tabs, lanes, Canvas file cards, Bases and the File properties view. The OS date picker popup is the one
  manual check.
- **Everything else** is built, unit-tested (`npm run check`) and was used in the author's vaults, but not confirmed
  by the user in Obsidian.
- **Deep test catalogue** (2026-11-07): `TEST-CASES.md`, cases checked against this spec and common sense, each run
  in an isolated test Obsidian over the DevTools protocol with real key and mouse input, then fixed and re-run until a
  full run was clean. It records the final status per case and the date of the final run.
