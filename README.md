# Editor Defaults (Archit)

> **This is a personal plugin.** It enforces the conventions of my own vaults and is published only so I can
> install it with BRAT on my devices. Its defaults are hard-coded for my setup (attachment folder `u`, my core
> plugins and hotkeys), so it's unlikely to be useful to anyone else, and I don't take feature requests for it.

It enforces a set of vault settings on every device, at start and whenever they drift (for example after a
sync brings in another device's settings), with a notice naming the setting to turn off when you want to
change one. Each item can be turned off:

- New links use the path from the vault root, and picking a note from `[[` inserts `[[path]]` without
  Obsidian's `|name` alias.
- Attachments go to one folder (`u`).
- Deleted files go to the Obsidian trash.
- Core plugins: Bases on; Templates, Unique note creator and Backlinks off.
- A fixed set of hotkeys (navigate back / forward, Templater).
- Date properties show and take `YYYY-MM-DD` (and `YYYY-MM-DD HH:mm:ss`) instead of the system's locale format.

## Install with BRAT

BRAT → **Add beta plugin** → `{{REPO}}` → Add plugin, then enable **Editor Defaults (Archit)** in Community plugins.

## Building

```sh
npm install
npm run build   # main.js
npm test        # unit tests
```

## Licence

MIT
