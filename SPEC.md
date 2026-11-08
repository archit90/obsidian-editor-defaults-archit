# Editor Defaults (Archit): specification

This document describes the plugin as it is now; `README.md` is the user guide and `TEST-CASES.md` the test
catalogue. **Keeping this current:** every change updates this document in the same commit. There is no change
log: git history has the past, this document the present.

Plugin id `editor-defaults-archit` (until 2026-11-08 `obsidian-editor-defaults`, display name Editor Defaults); repo `archit90/obsidian-editor-defaults-archit`. A personal plugin: it enforces the settings of the author's note system, and is published only so BRAT can install it.

## Behaviour

Enforces vault settings on every device, on load and whenever they drift. Each item has an on/off setting, all on
by default.

- **Load** applies every default silently (no notice). Only a hotkey clash already there is warned about (Enforce
  hotkeys, below).
- **Drift:** while an item's setting is on, a change made in Obsidian's settings, by a synced `app.json` /
  `hotkeys.json` or by another plugin is put back about 0.3 s later, with a notice naming what was put back and the
  Editor Defaults (Archit) setting to turn off for changing it. `core-plugins.json` changed on disk is applied at the
  next start (Obsidian doesn't reload it while running).
- **One check at a time:** checks run one after another. A change that comes in while one is applying (from sync, a
  person or another plugin) gets a check of its own right after, instead of being lost.
- **Open Settings tabs:** after a put-back, an open Files and links, Core plugins or Hotkeys tab is redrawn so it
  shows the value again (the Hotkeys tab keeps its filter, the others their scroll position). No other tab is
  redrawn, other plugins' tabs among them. This plugin's own tab is redrawn when its settings change on disk.
- **Fights:** if something keeps undoing one item (another plugin, or another device with a different version of
  Editor Defaults (Archit) or other settings), it is put back at most 5 times in 10 s; then it's left alone (console
  warning) and checked again by itself once that window has passed. After more than 10 put-backs of the item within
  10 minutes it's left alone for the rest of the session, with one notice; it's enforced again after Obsidian
  restarts or this plugin's settings change.
- **Its own settings** are read from `data.json` and validated (unknown keys and values of the wrong type are
  ignored). When `data.json` changes on disk (the settings from another device, through sync), the new settings are
  used at once.
- **What it enforces** is listed once, in `src/defaults.json`: the attachment folder's default, the `app.json`
  values, the core plugins (with the community plugin that replaces each, if any) and the hotkeys (with each command's
  name). `src/defaults.ts` reads and checks it; the e2e suite checks a vault against the same file.

## Settings

| Setting                                | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New links use path from vault root     | "New link format" = Absolute path in vault. Heading and block links picked from the `[[` dropdown get the full path too (Obsidian keeps the note name as typed; decision 4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Insert `[[path]]` without alias        | Picking a note from Obsidian's `[[` (or `![[`) dropdown, in the editor or in a property field, inserts `[[path]]`, not `[[path\|name]]`, however the pick is taken (Enter, Tab, click, or `#` / `^` to go on to a heading or block). Only the alias Obsidian adds itself (the note name) is removed; an alias you typed, or one of the note's aliases you picked, stays (decision 1). Works with absolute and relative link formats, and in tables (Live Preview cells and source-mode rows). Other suggesters (tags, slash commands, every plugin's) are never changed.                                                                                                                                                                                                                                                                                                                                                                                         |
| Keep attachments in one folder         | "Default location for new attachments" = the folder below (`u`). The folder is applied when you leave the field or close the tab: a check while you type keeps the folder from before. An empty field keeps nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Deleted files go to the Obsidian trash | "Deleted files" = Move to Obsidian trash (`.trash`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Enforce core plugins                   | Bases on and Unique note creator off; Templates off while Templater is enabled, and Backlinks off while Backlinks Full View is enabled, which replace them (decision 6). Without Templater or Backlinks Full View, Templates or Backlinks is left alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Enforce hotkeys                        | Exactly these hotkeys (a custom hotkey replaces a command's defaults, so defaults are listed too): Navigate back Mod+Alt+← and Mod+[; Navigate forward Mod+Alt+→ and Mod+]; Templater "Create new note from template" Alt+N; Templater "Open insert template modal" none (written as `[]` even when `hotkeys.json` had no entry for it). Written to `hotkeys.json` by command id, so a plugin's hotkeys are saved while it isn't installed and work once it is. When another command has one of these hotkeys (its own or its default; Mod is Ctrl, Cmd on macOS and iOS), a notice names both and points to Settings → Hotkeys, at load and when hotkeys change, once per clash per session; that hotkey is left alone (decision 3). An enforced command that doesn't exist clashes with nothing. Notices name every command, also one whose plugin isn't installed.                                                                                            |
| Dates in properties as YYYY-MM-DD      | Date properties show and take `YYYY-MM-DD`, Date & time properties `YYYY-MM-DD HH:mm:ss`, instead of the system's locale format. The note keeps Obsidian's stored format (`YYYY-MM-DDTHH:mm:ss`), which Dataview and Bases read. Text that isn't strictly that format is outlined red while you type; when you leave the field it isn't saved, the field goes back to the stored value, and a notice says the text wasn't a valid date (decision 2). A calendar button (keyboard-accessible) opens the native picker next to the field and writes ISO back; a time picked without seconds gets `:00`. After a value is saved, the field shows it as stored (`YYYY-MM-DD HH:mm:ss`, decision 5). At start the fields are drawn this way from the first; turning the setting (or the plugin) on or off while Obsidian runs redraws the date fields of open notes, cards, the File properties view and Bases tabs at once (Bases embedded in a note: on reopening). |

## Working with other plugins

None is needed, and none is imported or called. Editor Defaults (Archit) only looks whether a community plugin is
loaded (`app.plugins.plugins[<id>]`), and acts on Obsidian's own settings, hotkeys, editors and property fields.

- **Templater** (`templater-obsidian`)
  - With it: core Templates is kept off; Alt+N runs Templater's "Create new note from template", and its "Open
    insert template modal" has no hotkey (its Alt+E default is replaced by an explicit `[]`).
  - Without it: Templates is left alone. The two hotkeys are written all the same, by command id: Obsidian skips a
    hotkey whose command doesn't exist and runs another command with that key, and the hotkeys are right the moment
    Templater is installed. They clash with nothing, and notices name the commands (from `src/defaults.json`).
  - Tests without it: A6b, C3n, C3ts (Templater simulated by an entry in `app.plugins.plugins`), D10 (its command
    simulated with `app.commands.addCommand`). With it: A6, C3t, D2, D3, D10t.
- **Backlinks Full View** (`backlinks-full-view`): with it, core Backlinks is kept off (its "All backlinks" pane
  replaces it); without it, Backlinks is left alone. Tests: C2 (with it), C2s (simulated), C2n (without).
- **Editor Multiple Lanes** (`editor-multiple-lanes`): nothing in common in the code. Its cards are ordinary
  MarkdownViews in a lanes tab, so `[[` picks, property picks and date fields work there as in a tab, turning "Dates
  in properties" off or on redraws them, and Alt+N reaches Obsidian's hotkeys from a card. The e2e suite keeps its
  "tab" cases in normal tabs with one routing exception (Lanes' test API: `settings.routeExceptions`, then
  `settingsChanged("routing")`), saved before and put back after. Tests with it: E1-lanes, E13-lanes-src, F1-lanes,
  F10-lanes, and D2-lanes and D3-lanes (with Templater).
- **Editor Outliner** (`editor-outliner`): nothing in common. Its keys are a CodeMirror keymap, not Obsidian
  hotkeys, so they never clash with the enforced ones. The full run with every plugin enabled includes it.
- **Core plugins:** Bases (kept on; Bases tables' date cells get the ISO fields), Templates, Unique note creator and
  Backlinks (above), Properties (the File properties view gets the ISO fields), Canvas (its text and file cards'
  editors and properties work as in a tab).
- **Other plugins:** Editor Defaults (Archit) patches only Obsidian's own objects, and undoes it on unload: the `[[`
  link suggester's `selectSuggestion` (only Obsidian's own: the editor suggester with a `suggestManager` that finds
  notes), the property-value link suggester's prototype (found the first time an AbstractInputSuggest shows its
  suggestions; every other one passes through untouched), `hotkeyManager.save` (to see hotkey changes) and the date
  / date & time property widgets' `render`. Another plugin's suggester, settings tab or hotkeys are never changed;
  another plugin that keeps changing an enforced value meets the fight limits (Behaviour).
- **Sync** (Obsidian Sync, Self-hosted LiveSync, a git sync…): `app.json` and `hotkeys.json` changed on disk are put
  back; this plugin's `data.json` changed on disk is used at once. Two devices with different versions of Editor
  Defaults (Archit) or different settings fight through sync until the fight limits stop it (Known limits).

## Decisions

Numbered so `TEST-CASES.md` can cite them ("decision 3").

- **1. Only Obsidian's own alias goes.** "Insert `[[path]]` without alias" removes an alias only on a note pick (not
  on heading, block or alias picks) and only when it is the note's name, which is what Obsidian adds. Retargeting
  `[[old|my words]]` keeps "my words".
- **2. Strict ISO dates.** Obsidian's own parse is lenient (`06/11/2026` becomes 2006-11-20, `2026` 2026-01-01).
  Anything but `YYYY-MM-DD` (date & time: `YYYY-MM-DD HH:mm` or `HH:mm:ss`, with a space or `T`) is outlined red
  while typed and isn't saved; leaving the field puts the stored value back, with a notice saying so.
- **3. Hotkey clashes are warned about, never fixed.** Another command with an enforced hotkey keeps it; a notice
  names both commands, once per clash per session.
- **4. Heading and block paths follow the setting.** A heading or block pick gets the path from the vault root only
  while "New links use path from vault root" is on and new links use absolute paths.
- **5. Date & time fields show seconds.** The browser's `datetime-local` value leaves out zero seconds, so they are
  added to the text field (`…T09:30:00` shows as `09:30:00`, not `09:30`).
- **6. Core plugins with a replacement.** Templates and Backlinks are kept off only while Templater and Backlinks
  Full View are loaded.
- **7. Fights stop.** At most 5 put-backs of one item in 10 s, then a pause and a check when it ends; more than 10 in
  10 minutes stop that item for the session, with one notice.

## Known limits

- Templater or Backlinks Full View enabled or disabled while Obsidian runs counts from the next check (the next
  drift of anything enforced) or the next start: Obsidian has no event for it.
- Devices with different versions of Editor Defaults (Archit) (BRAT updates each device on its own) or different
  settings put each other's values back through sync until the fight limit stops the item for the session (decision 7). A
  version stamp in `data.json`, so that an older version stands down, is an open idea.
- A pick from the `[[` dropdown is two undo steps: Obsidian's insertion, then the fix (the first Ctrl+Z brings the
  alias back).
- A synced `hotkeys.json` is checked 0.3 s after Obsidian sees it change, assuming Obsidian has reloaded it by then
  (it does after about 50 ms). A much slower reload would be missed until the next change; it hasn't been seen.
- Bases embedded in a note redraw their date cells on reopening, not at once.
- The OS date picker popup (F9) is checked by hand.

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
  `monkey-around` and are registered with the plugin, so they come off on unload. What the plugin enforces is data,
  `src/defaults.json`, read and checked by `src/defaults.ts` (a malformed file fails the unit tests); `styles.css`
  holds the date fields' picker layout.
- **Internals:** every Obsidian internal used was checked against Obsidian 1.15.0's `app.js` and `app.css`.
  `minAppVersion` is 1.15.0. A new Obsidian version means re-checking them.
- **Versions and releases:** the version is 0.1.1, and releases bump the patch version only (0.1.1 → 0.1.2 …);
  the minor and major stay. `npm run release` (= `npm version patch`) bumps `package.json`, then
  `scripts/version-bump.mjs` copies the version into `manifest.json` and `versions.json`; npm commits and tags it
  (tag = the version, no `v`, `.npmrc`). `scripts/version-bump.mjs` refuses a new minor or major version (and puts
  `package.json` back) unless it's asked for with `ALLOW_MINOR_BUMP=1 npm version minor|major`. `git push
--follow-tags` runs `.github/workflows/release.yml`: `npm run check`, a check that the tag is the manifest
  version, then a GitHub release with `main.js`, `manifest.json` and `styles.css`, which BRAT installs.
  `isDesktopOnly` is false.
- **Trying a build in a vault:** `npm run deploy -- <vault> …` (or `OBSIDIAN_VAULTS`) builds and copies `main.js`,
  `manifest.json` and `styles.css` into each vault that already has the plugin (`--install` adds it); `data.json`
  is never touched. Reload the plugin in Obsidian afterwards.
- **End-to-end tests:** `e2e/sandbox.sh start|stop|restart|reset|deploy|shot|status <n>` runs a throwaway Obsidian
  (`OBS_APP`, default the 1.15.0 AppImage) on its own Xvfb display `:110+n` (never on your screen), with its own
  profile, its own vault in `.sandbox/sb<n>/` (git-ignored) and the DevTools port `9310+n`. The vault is a fresh
  empty one with only this plugin, plus any plugins in `OBS_PLUGINS` (built folders or GitHub releases, separated by
  `:`) to test them together; or a copy of `OBS_VAULT` (e.g. a big test vault). Every start installs the current
  build. The suite in `e2e/` drives it over the DevTools protocol (`e2e/cdp.mjs`) with real key and mouse input.
  Needs Xvfb, rsync, curl, node and ImageMagick.
  - This plugin's sandbox is 2 (port 9312). `npm run e2e` (`e2e/run.mjs [--filter <id-regex>]`) runs the catalogue;
    `npm run e2e:restart` (`e2e/restart.sh`) the restart case A1, and `npm run e2e:fresh` the fresh-vault case A1b
    (it resets the sandbox). `e2e/a1-check.mjs` checks them, console errors included (`Runtime.enable` replays the
    ones logged before it connected).
  - Fixtures (`e2e/fixtures.mjs`, all under `_test/`) are written on disk by `e2e/make-vault.mjs` when the sandbox
    makes its vault (with their property types, and Templater's templates folder when it's installed without
    settings), and created if missing by the runner's prepare step. A copy of a real vault only gains these paths.
  - A case that needs another plugin says so (`needs`) and is skipped without it; `E2E_REQUIRE=<id>,<id>` makes that
    a failure. A case about life without a plugin (`unless`) is skipped while it's loaded. The runner exits 1 on a
    failed case, a console error from this plugin, or a vault left out of its defaults.

## Verification status

- **End-to-end, alone** (2026-11-08, a fresh vault with only this plugin: `npm run build && e2e/sandbox.sh reset 2 &&
npm run e2e`): 68 of the 84 cases run; the 16 others need Templater, Backlinks Full View or Editor Multiple
  Lanes and are skipped. No console error. Three full runs passed every case; in the last, B11 failed once (passed on
  rerun) and B3 (`app.json` edited on disk) failed because Obsidian didn't reload the file there, so nothing reached
  the plugin: both are recorded as flaky. The restart A1 and the fresh vault A1b pass.
- **End-to-end, together** (2026-11-08, with Templater 2.26.0, Editor Multiple Lanes, Backlinks Full View and Editor
  Outliner, `E2E_REQUIRE` set for the first three): 78 of the 84 cases run, 76 pass. D3-lanes and D3-canvas-text (Templater's new note from a lanes card / Canvas text card) are flaky in the full run: each passed in another run and on its own. The other 6 are about life without Templater or Backlinks Full View and are skipped. No console error.
- **Unit tests** (`npm run check`): 57, for the pure logic (link fixes, ISO dates, defaults.json, the fight guard,
  settings).
- **By hand:** the OS date picker popup (F9). Everything else is checked by the suites above and was used in the
  author's vaults, but not confirmed by the user in Obsidian.
