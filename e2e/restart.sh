#!/usr/bin/env bash
# Restart cases of TEST-CASES.md, on sandbox $SANDBOX (default 2) through e2e/sandbox.sh (npm run e2e:restart):
#   e2e/restart.sh           A1: stop Obsidian, drift app.json / core-plugins.json / hotkeys.json on disk, start again:
#                            every value of the settings note is back at load, silently, with no console error; the date note and the
#                            Bases tab restored with the workspace show ISO date fields (the Bases tab, restored in
#                            the background, isn't rebuilt at start)
#   e2e/restart.sh --fresh   A1b: a fresh vault (e2e/sandbox.sh reset): the first load asks once (the settings note
#                            differs from the vault on a device not set up yet), "Apply the note" writes it; the next
#                            start changes nothing, silently. (Obsidian itself rewrites app.json and
#                            core-plugins.json at every start, with the same content: their content is compared, and
#                            hotkeys.json, which only Editor Defaults writes, must keep its time too.)
# OBS_SANDBOX_DIR and OBS_PLUGINS work as for e2e/sandbox.sh. Exit 1 when a check fails.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
N=${SANDBOX:-2}
export CDP_PORT=$((9310 + N))
CFG=${OBS_SANDBOX_DIR:-$(dirname "$HERE")/.sandbox}/sb$N/vault/.obsidian
fail=0
state() {
  for f in app.json core-plugins.json hotkeys.json; do
    if [ -f "$CFG/$f" ]; then printf '%s:%s ' "$f" "$(sha1sum <"$CFG/$f" | cut -c1-10)"; else printf '%s:- ' "$f"; fi
  done
  stat -c 'hotkeys.json@%Y' "$CFG/hotkeys.json" 2>/dev/null || echo "hotkeys.json@-"
}

if [ "${1:-}" = "--fresh" ]; then
  "$HERE/sandbox.sh" reset "$N" | tail -1 || exit 1
  sleep 3
  node "$HERE/a1-check.mjs" A1b-first-load --dialog || fail=1
  before=$(state)
  sleep 2
  "$HERE/sandbox.sh" restart "$N" | tail -1 || exit 1
  sleep 3
  node "$HERE/a1-check.mjs" A1b-second-load || fail=1
  after=$(state)
  if [ "$before" = "$after" ]; then echo "PASS A1b nothing changed ($after)"; else echo "FAIL A1b changed: $before -> $after"; fail=1; fi
  exit $fail
fi

node "$HERE/a1-check.mjs" prepare || exit 1
"$HERE/sandbox.sh" stop "$N"
python3 - "$CFG" <<'PY'
import json, os, sys
cfg = sys.argv[1]
def drift(name, change):
    path = os.path.join(cfg, name)
    data = json.load(open(path)) if os.path.exists(path) else {}
    change(data)
    json.dump(data, open(path, "w"), indent=2)
drift("app.json", lambda a: a.update(newLinkFormat="shortest", trashOption="system", attachmentFolderPath="./"))
# Backlinks / Templates on: put back only while Backlinks Full View / Templater are enabled (onlyWith)
drift("core-plugins.json", lambda c: c.update(bases=False, backlink=True, templates=True, **{"zk-prefixer": True}))
drift("hotkeys.json", lambda h: [h.pop(k, None) for k in ("app:go-back", "templater-obsidian:insert-templater")])
PY
"$HERE/sandbox.sh" start "$N" | tail -1 || exit 1
sleep 3
node "$HERE/a1-check.mjs" A1 --restored || fail=1
exit $fail
