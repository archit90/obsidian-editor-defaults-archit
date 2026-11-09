# Editor Defaults (Archit): specification

This document describes the plugin as it is now; `README.md` is the user guide and `TEST-CASES.md` the test
catalogue. **Keeping this current:** every change updates this document in the same commit. There is no change
log: git history has the past, this document the present.

Plugin id `editor-defaults-archit` (until 2026-11-08 `obsidian-editor-defaults`, display name Editor Defaults); repo `archit90/obsidian-editor-defaults-archit`. A personal plugin: it sets up the author's vaults from a settings note and adds a few editor behaviours; it's published only so BRAT can install it.

## Behaviour

Two parts: the **vault setup**, which keeps the vault's plugins and settings in line with a settings note, and three
**editor behaviours** for links and dates.

### The vault setup

The settings note (`Vault settings.md` at the vault root by default; the "Settings note" setting) says which plugins the vault has,
where each comes from, whether it's on, and every setting that differs from its default: Obsidian's, the core
plugins', the hotkeys, the property types, a core plugin's config file and each plugin's. Prose explains why;
fenced `vault-settings` blocks hold the values.

- **The note wins.** At start (once the workspace is ready) and within about a second of the note changing (an edit,
  or a synced note), its values are applied where the vault differs.
- **A change in Settings goes into the note.** A change made in Obsidian's Settings window (any tab: Files and links,
  Core plugins, Hotkeys, Community plugins, a plugin's own tab) is written into its block, with a dated line under it
  (``- `templates_folder` changed in Settings, 2026-11-09.``). A key that's new is added; a setting set back to its
  default is taken out (the note holds only what differs from the defaults). A plugin turned on or off there gets
  `state: enabled / disabled`, one uninstalled gets `state: uninstalled`, one installed gets a block of its own (a
  new section at the end of the note). A property type set or unset from a note's property menu counts the same.
  Changes up to 3 s after Settings closes still count (plugins save a moment later). A notice says what was saved.
- **Any other change is put back:** a synced `app.json` / `hotkeys.json` / `data.json`, another plugin, a command.
  A notice names what was put back and says to change it in Settings or in the note. Each setting is put back at most
  5 times in 10 s (then left alone, and checked again by itself when that window has passed) and 10 times in 10
  minutes (then left alone, with one notice, until the note changes or Obsidian restarts): something that keeps
  undoing a value (another plugin, a device with other settings) can't make it fight forever.
- **Installing and removing ask first.** A plugin the note lists that isn't installed, or one with `state:
uninstalled` that is, waits for one click in a dialog ("Apply and install" / "Not now"). The note syncs between
  devices, so nothing installs code on a device without a click there. "Not now" holds for the session until the
  list changes; the command "Apply the settings note now" asks again. The dialog waits until the Settings window is
  closed (trusting a new vault's plugins opens it) and opens in the main window.
- **The first run on a device** (nothing recorded in this vault's local storage yet) asks too when the vault differs
  from the note, listing what differs: "Apply the note", "Update the note from this vault" (each block takes the
  vault's values for what it lists, keeping only what differs from the defaults), or "Not now". A device where they
  already match is set up silently.
- **Installing** uses Obsidian's own installer (`installPlugin`, which also checks Obsidian's block list) with the
  plugin's release: for `source: community`, the version in its repo's `manifest.json` (the repo comes from
  Obsidian's `community-plugins.json`), as Obsidian installs it; for `source: github:<owner>/<repo>`, its latest
  release, as BRAT does; `version:` pins one. A download that fails is tried once more. The plugin is then loaded
  once without settings to measure its **defaults** (its settings object, or the `data.json` it writes while
  loading), which are kept in `plugin-defaults.json` next to this plugin's `data.json` so that settings set back to
  the default can be taken out of the note later. Then the note's settings are written and the plugin is enabled
  (or left off, for `state: disabled`).
- **Applying a plugin's settings:** they're merged into its `data.json` (objects key by key; a list or a value
  replaces it; keys the note doesn't list stay as they are). A plugin that's running gets them through its
  `onExternalSettingsChange` if it has one; otherwise it's turned off, written and turned on again, so it can't save
  its old settings over them. One that's installed but off just gets the file.
- **BRAT:** every block with a `github:` source (also this plugin's) is added to BRAT's list (`pluginList` and
  `pluginSubListFrozenVersion`, version `latest` or the pin), so BRAT updates it. BRAT's own lists are never taken
  into the note.
- **One run at a time:** applies and checks run one after another; a change that comes in while one runs gets a
  check of its own right after.
- **A block that can't be used** (YAML error, wrong value, a second block for the same thing) is skipped, the rest of
  the note still applies, and one notice per error names its line. The tab shows them too.
- **No note:** nothing is applied; one notice says so and names the command "Create the settings note from this
  vault", which writes one: Obsidian's settings, core plugins and hotkeys that differ from their defaults, the
  property types, and a block per installed plugin (its settings that differ from its defaults when those are known,
  none otherwise).
- **Ignored keys:** `previousRelease` (a plugin's note of the last version it saw) is never taken into a block; a
  block's `ignore:` lists more. The note never holds this plugin's `setupNote` and `setupEnabled`: which note to
  read is each device's own.

### The note's format

````markdown
## Templater

Templates live in `_t/`.

```vault-settings
plugin: templater-obsidian
source: community
settings:
  templates_folder: _t
```
````

| Block                      | Holds                                                                                                                                                                                                             | `settings`                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin: <id>`             | a community plugin: `source` (`community`, default, or `github:<owner>/<repo>`), `state` (`enabled`, default, `disabled`, `uninstalled`), `version` (a pinned release, in quotes), `ignore` (keys never taken in) | merged into its `data.json`                                                                                                                          |
| `obsidian: app`            | `app.json` and `appearance.json`                                                                                                                                                                                  | key: value                                                                                                                                           |
| `obsidian: core-plugins`   | core plugins on or off                                                                                                                                                                                            | `id: true/false`, or `id: { enabled: false, onlyWith: <plugin id> }` for one a community plugin replaces (kept so only while that plugin is enabled) |
| `obsidian: hotkeys`        | hotkeys by command id                                                                                                                                                                                             | `app:go-back: [Mod+Alt+ArrowLeft, "Mod+["]`; `[]` for none. A hotkey for a plugin that isn't installed is saved and works once it is                 |
| `obsidian: property-types` | `types.json`                                                                                                                                                                                                      | `name: date`                                                                                                                                         |
| `obsidian: <name>`         | `.obsidian/<name>.json`, a core plugin's settings (`canvas`…)                                                                                                                                                     | key: value; also given to the running core plugin                                                                                                    |

Any block can have `only: desktop` or `only: mobile`. The note's own text is never changed: only a block's YAML (when
a change is taken in), dated lines right below it, and new sections at the end.

### Editor behaviours

- **`[[path]]` without alias.** Picking a note from Obsidian's `[[` (or `![[`) dropdown, in the editor or in a
  property field, inserts `[[path]]`, not `[[path|name]]`, however the pick is taken (Enter, Tab, click, or `#` / `^`
  to go on to a heading or block). Only the alias Obsidian adds itself (the note name) is removed; an alias you
  typed, or one of the note's aliases you picked, stays (decision 1). Works with absolute and relative link formats,
  and in tables (Live Preview cells and source-mode rows). Other suggesters (tags, slash commands, every plugin's)
  are never changed.
- **Heading and block links use the path from the vault root** while "New link format" is "Absolute path in vault"
  (Obsidian keeps the note name as typed for those; decision 4).
- **Dates in properties as `YYYY-MM-DD`.** Date properties show and take `YYYY-MM-DD`, Date & time properties
  `YYYY-MM-DD HH:mm:ss`, instead of the system's locale format. The note keeps Obsidian's stored format
  (`YYYY-MM-DDTHH:mm:ss`), which Dataview and Bases read. Text that isn't strictly that format is outlined red while
  you type; when you leave the field it isn't saved, the field goes back to the stored value, and a notice says the
  text wasn't a valid date (decision 2). A calendar button (keyboard-accessible) opens the native picker next to the
  field and writes ISO back; a time picked without seconds gets `:00`. After a value is saved, the field shows it as
  stored (decision 5). At start the fields are drawn this way from the first; turning the setting (or the plugin) on
  or off while Obsidian runs redraws the date fields of open notes, cards, the File properties view and Bases tabs at
  once (Bases embedded in a note: on reopening).
- **Hotkey clashes** are warned about, never fixed: when another command has one of the hotkeys the note sets (its
  own or its default; Mod is Ctrl, Cmd on macOS and iOS), a notice names both and points to Settings → Hotkeys, at
  load and when hotkeys change, once per clash per session (decision 3).

## Settings

| Setting                                                  | Effect                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insert `[[path]]` without alias                          | The first behaviour above. On by default.                                                                                                                                                                              |
| Heading and block links use the path from the vault root | The second. On by default.                                                                                                                                                                                             |
| Dates in properties as YYYY-MM-DD                        | The third. On by default.                                                                                                                                                                                              |
| Set up the vault from the settings note                  | The vault setup. On by default; off, nothing is applied or taken in.                                                                                                                                                   |
| Settings note                                            | The note's path (`Vault settings.md`, at the vault root), applied when you leave the field. Per device: never in the note. 0.1.2's default `_s/Vault settings.md`, saved in a `data.json`, is read as the new default. |

Below them, **Status** says whether the vault matches the note (or what differs), what would be installed or
removed, and which blocks aren't used, with "Apply now" and "Open the note" (or "Create from this vault" when there is
no note). These settings are this plugin's `data.json`; when it changes on disk (another device, through sync) the
new settings are used at once. The first three can also be set in the note (`plugin: editor-defaults-archit`).

**Commands:** Apply the settings note now · Show what differs from the settings note · Create the settings note from
this vault · Update the settings note from this vault · Open the settings note.

## Working with other plugins

None is needed, and none is imported or called. The vault setup acts on other plugins only through Obsidian (its
installer, enabling and disabling, their `data.json`, an `onExternalSettingsChange` they have) and BRAT through its
settings; the editor behaviours act on Obsidian's own editors and property fields.

- **Any community plugin** the note lists: installed, turned on or off, and given its settings as above. A plugin
  that keeps a setting outside `data.json` (in local storage or a file of its own) isn't covered there.
- **BRAT** (`obsidian42-brat`): GitHub blocks are added to its lists. Without it, GitHub plugins are installed and
  set up all the same, just not updated.
- **Templater** (`templater-obsidian`): `templates: { enabled: false, onlyWith: templater-obsidian }` keeps core
  Templates off only while Templater is enabled; its hotkeys are written by command id whether it's installed or not.
  Tests with it: A6, C3t, D2, D3, D10t; without it: A6b, C3n, C3ts, D10.
- **Backlinks Full View** (`backlinks-full-view`): the same for core Backlinks (`onlyWith: backlinks-full-view`).
  Tests: C2 (with it), C2s (simulated), C2n (without).
- **Editor Multiple Lanes** (`editor-multiple-lanes`): its cards are ordinary MarkdownViews in a lanes tab, so `[[`
  picks, property picks and date fields work there as in a tab, and Alt+N reaches Obsidian's hotkeys from a card. The
  e2e suite keeps its "tab" cases in normal tabs with one routing exception (Lanes' test API:
  `settings.routeExceptions`, then `settingsChanged("routing")`), saved before and put back after. Tests with it:
  E1-lanes, E13-lanes-src, F1-lanes, F10-lanes, D2-lanes and D3-lanes.
- **Editor Outliner** (`editor-outliner`): nothing in common. Its keys are a CodeMirror keymap, not Obsidian hotkeys.
- **Core plugins:** Bases (Bases tables' date cells get the ISO fields), Properties (the File properties view gets
  them), Canvas (its cards work as in a tab; `obsidian: canvas` sets its config file).
- **Patches:** Editor Defaults (Archit) patches only Obsidian's own objects, and undoes it on unload: the `[[` link
  suggester's `selectSuggestion`, the property-value link suggester's prototype, the date / date & time property
  widgets' `render`, `hotkeyManager.save` (to see hotkey changes), the Settings window's `onClose` (to know a change
  came from there) and `metadataTypeManager.setType` / `unsetType` (a property type set by a person).
- **Sync** (Obsidian Sync, Self-hosted LiveSync, git): the note syncs like any note, so a change in Settings on one
  device reaches the others through it. Config files that change on disk are checked: put back unless the note
  changed too.

## Decisions

Numbered so `TEST-CASES.md` can cite them ("decision 3").

- **1. Only Obsidian's own alias goes.** "Insert `[[path]]` without alias" removes an alias only on a note pick (not
  on heading, block or alias picks) and only when it is the note's name, which is what Obsidian adds.
- **2. Strict ISO dates.** Anything but `YYYY-MM-DD` (date & time: `YYYY-MM-DD HH:mm` or `HH:mm:ss`, with a space or
  `T`) is outlined red while typed and isn't saved.
- **3. Hotkey clashes are warned about, never fixed.**
- **4. Heading and block paths follow the link format:** only while new links use absolute paths.
- **5. Date & time fields show seconds.**
- **6. Core plugins with a replacement** are kept off only while the replacing plugin is loaded (`onlyWith`).
- **7. Fights stop:** at most 5 put-backs of one setting in 10 s, then a pause and a check when it ends; more than 10
  in 10 minutes stop it until the note changes or Obsidian restarts.
- **8. The note wins, except Settings.** A change in the Settings window is the person's choice and goes into the
  note; anything else is put back. Installs and removals always ask.
- **9. Only what differs from the defaults** is in the note: a setting set back to its default leaves it.
- **10. The note's location is per device:** `setupNote` and `setupEnabled` are never in it.

## Known limits

- **Who made a change** is told by timing: during or up to 3 s after the Settings window, or a property type set from
  a note. A synced file that lands in that window is taken in as if made in Settings; a plugin's own panel outside
  Settings (Excalidraw's in-view options, say) counts as "another change" and is put back.
- **Defaults are known** for plugins the setup installed (measured then) and for this plugin. For one installed
  another way, a setting set back to its default stays in the note with its default value. Tasks and Style Settings
  keep their settings where the measurement can't see them.
- **A plugin turned off and on** to get new settings (one without `onExternalSettingsChange`) closes its views for a
  moment.
- **Core plugins' `core-plugins.json` changed on disk** is applied at the next start (Obsidian doesn't reload it).
- **BRAT names repositories, not ids:** a plugin installed with BRAT outside the note is recognised as `github:` only
  when its repository is named `<id>` or `obsidian-<id>`; otherwise its new block says `community`.
- A pick from the `[[` dropdown is two undo steps (Obsidian's insertion, then the fix).
- Bases embedded in a note redraw their date cells on reopening. The OS date picker popup (F9) is checked by hand.

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
  `monkey-around` and are registered with the plugin, so they come off on unload. The vault setup is in `src/setup/`: `note.ts` (the
  note's blocks as text), `model.ts` (the blocks checked and typed), `json.ts` (merge, diff, capture), `hotkeys.ts`,
  all pure; `targets.ts` (where each kind of block lives in the vault), `setup.ts` (applying, watching, taking changes
  in) and `modal.ts` use Obsidian. `styles.css` holds the date fields' picker layout and the status line.
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

- **End-to-end, alone** (2026-11-09, a fresh vault with only this plugin and the suite's settings note:
  `npm run build && e2e/sandbox.sh reset 2 && npm run e2e`): 77 of the 94 cases run, all pass, no console error; the
  17 others need Templater, Backlinks Full View, Editor Multiple Lanes or BRAT. The restart A1 and the fresh vault A1b
  (the first-run dialog, then nothing changed at the next start) pass. The S cases install, turn off and remove a
  real community plugin (Hider) from its GitHub release.
- **End-to-end, together** (2026-11-09, with Templater 2.27, BRAT 2.2, Editor Multiple Lanes, Backlinks Full View and
  Editor Outliner, `E2E_REQUIRE` for the first four): 88 of the 94 cases run, all pass, no console error; the 6 others
  are about life without Templater or Backlinks Full View.
- **Unit tests** (`npm run check`): 55, for the pure logic (the note's blocks and their edits, the block checks, JSON
  merge / diff / capture, hotkey strings, link fixes, ISO dates, the fight guard, settings).
- **By hand:** the OS date picker popup (F9).
