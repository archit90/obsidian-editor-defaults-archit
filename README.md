# Editor Defaults (Archit)

> **This is a personal plugin.** It enforces the conventions of my own vaults and is published only so I can
> install it with BRAT on my devices. It's built around my own setup and note system, so it may not suit
> anyone else, and I don't take feature requests for it.

It does two things.

**It sets up the vault from a settings note** (`Vault settings.md` at the vault root): which plugins the vault has, where each comes
from, whether it's on, and every setting that differs from its default (Obsidian's, the core plugins', the hotkeys,
the property types and each plugin's), with the reasons written around them. The values are in fenced blocks:

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

- At start and whenever the note changes, its values are applied.
- A plugin the note lists that isn't installed is installed from its release after one click (and a GitHub one is
  added to BRAT, which keeps it updated).
- A change you make in Settings is written into the note, dated; a setting set back to its default leaves the note.
  Any other change (a synced file, another plugin) is put back.
- A new device asks once whether to apply the note or take this vault's values into it.
- No note yet? The plugin creates its default one (my setup, bundled in the plugin) and asks before applying it:
  apply it, or take this vault's values into it.

**And three editor behaviours** (each can be turned off):

- Picking a note from `[[` inserts `[[path]]` without Obsidian's `|name` alias.
- Heading and block links get the path from the vault root too, while links use absolute paths.
- Date properties show and take `YYYY-MM-DD` (and `YYYY-MM-DD HH:mm:ss`) instead of the system's locale format.

`SPEC.md` has the details: the block kinds, the rules, the limits.

## Install with BRAT

BRAT → **Add beta plugin** → `archit90/obsidian-editor-defaults-archit` → Add plugin, then enable **Editor Defaults (Archit)** in Community plugins.

## Building

```sh
npm install
npm run build                    # main.js
npm test                         # unit tests
npm run check                    # format, lint, typecheck, unit tests, build, smoke load: before every commit
npm run deploy -- <vault> …      # build and copy into vaults that have the plugin installed (--install adds it)
```

Releasing: `npm run release` bumps the patch version only (0.1.0 → 0.1.1 …) in `package.json`, `manifest.json`
and `versions.json` and tags the commit with it; `git push --follow-tags` then runs the release workflow, which
checks, builds and publishes the GitHub release BRAT installs from. A new minor or major version is a deliberate
choice: `ALLOW_MINOR_BUMP=1 npm version minor`.

End-to-end tests run in a throwaway Obsidian (sandbox 2: `e2e/sandbox.sh`, see `SPEC.md`, Development):
`npm run build && e2e/sandbox.sh reset 2 && npm run e2e`, then `npm run e2e:restart`. The cases are in `TEST-CASES.md`.

## Licence

MIT
