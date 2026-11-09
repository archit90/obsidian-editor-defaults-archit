---
type: system
created: 2026-11-09T12:00:00
---

# Vault settings

This vault's plugins and the settings that differ from their defaults, with the reason for each. Editor Defaults
(Archit) reads the `vault-settings` blocks:

- **At start, and whenever this note changes,** it applies them. A missing plugin is installed after one click.
- **A change you make in Settings** is written back into the blocks, with a dated line.
- **Any other change** (a synced file, another plugin) is put back.

Only the blocks are rewritten; the text around them is never touched. A setting back at its default is taken out
of its block, so each block lists only real choices.

## Obsidian

- **Links are written as the full path from the vault root.** Every link reads the same wherever it is, and it
  survives notes being moved around.
- **Links update when a note moves.**
- **Attachments go to `u/`.**
- **Deleted files go to `.trash/` in the vault.** You can get them back on every device, and vault-sync carries
  them.
- **Other files are shown in the file explorer** (PDFs, canvases, drawings).

```vault-settings
obsidian: app
settings:
  newLinkFormat: absolute
  alwaysUpdateLinks: true
  attachmentFolderPath: u
  trashOption: local
  showUnsupportedFiles: true
```

## Core plugins

Some core plugins are replaced by community plugins:

- **Backlinks** by Backlinks Full View's panes, so it's off, but only while Backlinks Full View is enabled.
- **Templates** by Templater, so it's off only while Templater is enabled.

Daily notes are off because logs come from Templater's folder templates. Sync is off because the vault is synced
with git (vault-sync).

```vault-settings
obsidian: core-plugins
settings:
  backlink:
    enabled: false
    onlyWith: backlinks-full-view
  templates:
    enabled: false
    onlyWith: templater-obsidian
  daily-notes: false
  sync: false
```

## Hotkeys

- **Navigate back and forward** also get Mod+[ and Mod+]: one hand, the same keys as in a browser.
- **Templater's "Create new note from template"** is Alt+N.

A hotkey for a plugin that isn't installed is kept, and works once the plugin is.

```vault-settings
obsidian: hotkeys
settings:
  app:go-back: [Mod+Alt+ArrowLeft, "Mod+["]
  app:go-forward: [Mod+Alt+ArrowRight, "Mod+]"]
  templater-obsidian:create-new-note-from-template: [Alt+N]
```

## Property types

These are the note system's properties (`system.md`): they're dates, lists or checkboxes, so Dataview, Bases and
the weekly review read them the same everywhere.

```vault-settings
obsidian: property-types
settings:
  type: text
  created: datetime
  status: text
  distill: checkbox
  topics: multitext
  parents: multitext
  parent: text
  sources: multitext
  kind: text
  author: multitext
  year: number
  url: text
  org: multitext
  cadence: text
  area: multitext
  due: date
  private: checkbox
```

## Canvas

New canvases go to `c/`.

```vault-settings
obsidian: canvas
settings:
  newFileLocation: folder
  newFileFolderPath: c
```

## Templater

Templater replaces core Templates:

- **Templates** are in `_t/`.
- **Folder templates** give each folder its note type when a note is created there.
- **The cursor** jumps to the template's `tp.file.cursor()`.
- **The log template** has its own hotkey command.

```vault-settings
plugin: templater-obsidian
source: community
settings:
  templates_folder: _t
  trigger_on_file_creation_mode: folder
  auto_jump_to_cursor: true
  folder_templates:
    - folder: "0"
      template: _t/log.md
    - folder: z
      template: _t/zettel.md
    - folder: n
      template: _t/entity.md
    - folder: p
      template: _t/project.md
    - folder: x
      template: _t/moc.md
    - folder: _s
      template: _t/system.md
  enabled_templates_hotkeys: [_t/log.md]
```

## Dataview

Dataview runs the dashboards' queries in `x/`. Its defaults are fine.

```vault-settings
plugin: dataview
source: community
```

## Tasks

Todos use Dataview's format (`[due:: …]`), so Dataview queries read them too. Tasks keeps its defaults out of reach,
so a setting changed back to its default stays listed here.

```vault-settings
plugin: obsidian-tasks-plugin
source: community
settings:
  taskFormat: dataview
```

## Advanced Tables

```vault-settings
plugin: table-editor-obsidian
source: community
```

## Calendar

```vault-settings
plugin: calendar
source: community
```

## Style Settings

```vault-settings
plugin: obsidian-style-settings
source: community
```

## Advanced Canvas

```vault-settings
plugin: advanced-canvas
source: community
```

## Enhanced Canvas

```vault-settings
plugin: enhanced-canvas
source: community
```

## PDF++

```vault-settings
plugin: pdf-plus
source: community
```

## Omnisearch

```vault-settings
plugin: omnisearch
source: community
```

## Excalidraw

Every drawing lives in `d/`: the drawings themselves, also those created from a note, the template, the scripts,
the libraries and the CJK fonts. The library itself (`library2`) is your drawings' data, not a setting.

```vault-settings
plugin: obsidian-excalidraw-plugin
source: community
ignore: [library2]
settings:
  folder: d
  embedUseExcalidrawFolder: true
  templateFilePath: d/Template.excalidraw
  scriptFolderPath: d/Scripts
  libraryFolderPath: d/Libraries
  fontAssetsPath: d/CJK Fonts
```

## BRAT

BRAT updates the GitHub plugins below from their releases. Editor Defaults (Archit) adds every block with a
`github:` source to its list.

```vault-settings
plugin: obsidian42-brat
source: community
```

## Backlinks Full View

```vault-settings
plugin: backlinks-full-view
source: github:archit90/obsidian-backlinks-full-view
```

## Editor Multiple Lanes

```vault-settings
plugin: editor-multiple-lanes
source: github:archit90/obsidian-editor-multiple-lanes
```

## Editor Outliner

```vault-settings
plugin: editor-outliner
source: github:archit90/obsidian-editor-outliner
```

## Editor Defaults (Archit)

This plugin. Its link and date behaviours are on by default, and it reads this note.

```vault-settings
plugin: editor-defaults-archit
source: github:archit90/obsidian-editor-defaults-archit
```
