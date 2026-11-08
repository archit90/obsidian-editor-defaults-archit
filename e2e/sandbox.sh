#!/usr/bin/env bash
# Throwaway Obsidian instances for this plugin's end-to-end tests. Each sandbox runs on its own virtual X display
# (Xvfb), so it never shows on your screen or touches your own Obsidian, with its own profile, its own vault and
# its own DevTools (CDP) port, so several can run in parallel.
#
#   e2e/sandbox.sh start   <n>             create sandbox n's vault if missing, install this build, start it
#   e2e/sandbox.sh stop    <n>             stop sandbox n's Obsidian and its display
#   e2e/sandbox.sh restart <n>             stop, then start again with the same vault and profile
#   e2e/sandbox.sh reset   <n>             stop, delete sandbox n's vault and profile, start fresh
#   e2e/sandbox.sh deploy  <n>             copy this build (main.js, manifest.json, styles.css) in and reload it
#   e2e/sandbox.sh shot    <n> <file.png>  screenshot of sandbox n's display
#
# Sandbox n: display :(110+n), CDP port 9310+n, files in $OBS_SANDBOX_DIR/sb<n>/ (default: .sandbox/ in this
# repo, git-ignored). Drive it with e2e/cdp.mjs (CDP_PORT=9310+n) or the e2e runner.
#
# Its vault, made on the first start:
# - OBS_VAULT unset: a fresh empty vault with only this plugin enabled;
# - OBS_VAULT=<vault>: a copy of that vault (it's never changed), with this build installed and enabled.
# Either way it gets a _test/ folder, and the plugins in OBS_PLUGINS, to test them together: a list separated by
# ":" of folders holding a built main.js and manifest.json, or GitHub repos as owner/repo (latest release) or
# owner/repo@<version>, downloaded once into .sandbox/plugins/. Every start copies the current build of this
# plugin in first, so a sandbox never runs a stale one.
#
# OBS_APP: the Obsidian AppImage or binary (default ~/AppImages/obsidian.appimage_1_15_0.appimage).
# Needs Xvfb, rsync, curl, node, and ImageMagick (`import`) for screenshots.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
ID=$(node -p "require('$ROOT/manifest.json').id")
APP=${OBS_APP:-$HOME/AppImages/obsidian.appimage_1_15_0.appimage}
cmd=${1:-}; n=${2:-}
usage() { awk 'NR > 1 && /^#/ { print; next } NR > 1 { exit }' "$0"; exit 2; }
[[ -n "$cmd" && "$n" =~ ^[0-9]+$ ]] || usage
D=$((110 + n)); PORT=$((9310 + n))
SB=${OBS_SANDBOX_DIR:-$ROOT/.sandbox}
BASE=$SB/sb$n; V=$BASE/vault; P=$BASE/profile

# a GitHub release (owner/repo or owner/repo@<version>) downloaded into .sandbox/plugins/; prints its folder
fetch_release() {
  local spec=$1 repo=${1%@*} url d
  if [[ "$spec" == *@* ]]; then url="https://github.com/$repo/releases/download/${spec#*@}"; else url="https://github.com/$repo/releases/latest/download"; fi
  d="$SB/plugins/${spec//\//__}"
  if [ ! -f "$d/manifest.json" ]; then
    mkdir -p "$d"
    for f in manifest.json main.js; do
      curl -fsSL -o "$d/$f" "$url/$f" || { echo "couldn't download $f of $spec ($url/$f)" >&2; rm -rf "$d"; return 1; }
    done
    curl -fsSL -o "$d/styles.css" "$url/styles.css" 2>/dev/null || rm -f "$d/styles.css"
  fi
  echo "$d"
}

# install the plugin built in folder $1 (or a GitHub release, see fetch_release) into the vault and enable it
install_plugin() {
  local src=$1 id
  if [ ! -d "$src" ] && [[ "$src" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(@.+)?$ ]]; then src=$(fetch_release "$src") || return 1; fi
  [ -f "$src/main.js" ] && [ -f "$src/manifest.json" ] || { echo "no build in $src (main.js, manifest.json)" >&2; return 1; }
  id=$(node -p "require('$src/manifest.json').id")
  mkdir -p "$V/.obsidian/plugins/$id"
  cp "$src/main.js" "$src/manifest.json" "$V/.obsidian/plugins/$id/"
  [ -f "$src/styles.css" ] && cp "$src/styles.css" "$V/.obsidian/plugins/$id/"
  node -e '
    const fs = require("fs"), [file, id] = process.argv.slice(1);
    const ids = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
    if (!ids.includes(id)) fs.writeFileSync(file, JSON.stringify([...ids, id], null, 2));
  ' "$V/.obsidian/community-plugins.json" "$id"
}

make_vault() {
  mkdir -p "$BASE"
  if [ -n "${OBS_VAULT:-}" ]; then
    [ -d "$OBS_VAULT/.obsidian" ] || { echo "OBS_VAULT isn't a vault (no .obsidian/): $OBS_VAULT" >&2; return 1; }
    rsync -a --exclude '.obsidian/workspace*.json' --exclude '.git' "${OBS_VAULT%/}/" "$V/"
  fi
  mkdir -p "$V/.obsidian/plugins" "$V/_test"
  local IFS=:
  for p in ${OBS_PLUGINS:-}; do install_plugin "$p" || return 1; done
}

stop() {
  [ -f "$BASE/obs.pid" ] && { pkill -TERM -P "$(cat "$BASE/obs.pid")" 2>/dev/null; kill "$(cat "$BASE/obs.pid")" 2>/dev/null; }
  pkill -f -- "--user-data-dir=$P" 2>/dev/null
  [ -f "$BASE/xvfb.pid" ] && kill "$(cat "$BASE/xvfb.pid")" 2>/dev/null
  rm -f "$BASE"/*.pid
  sleep 1
}

start() {
  [ -x "$APP" ] || { echo "Obsidian not found at $APP (set OBS_APP)" >&2; return 1; }
  # sandbox numbers are a convention shared by every plugin's repo: never start a second Obsidian on a used port
  if curl -s "localhost:$PORT/json/version" >/dev/null 2>&1; then
    echo "port $PORT is in use: sandbox $n is already running (this or another plugin's), stop it first" >&2
    return 1
  fi
  [ -f "$ROOT/main.js" ] || { echo "no main.js: build first (npm run build)" >&2; return 1; }
  [ -d "$V" ] || make_vault || return 1
  install_plugin "$ROOT" || return 1
  mkdir -p "$P"
  # the profile opens only this sandbox's vault
  printf '{"vaults":{"sandbox%s":{"path":"%s","ts":%s000,"open":true}},"updateDisabled":true}\n' "$n" "$V" "$(date +%s)" >"$P/obsidian.json"
  if [ ! -e "/tmp/.X11-unix/X$D" ]; then
    Xvfb ":$D" -screen 0 1600x1000x24 -nolisten tcp >"$BASE/xvfb.log" 2>&1 &
    echo $! >"$BASE/xvfb.pid"
    sleep 1
  fi
  env -u WAYLAND_DISPLAY DISPLAY=":$D" XDG_SESSION_TYPE=x11 \
    setsid "$APP" --no-sandbox --ozone-platform=x11 --force-device-scale-factor=1 --user-data-dir="$P" \
    --remote-debugging-port="$PORT" --remote-allow-origins=http://localhost >"$BASE/obs.log" 2>&1 &
  echo $! >"$BASE/obs.pid"
  for _ in $(seq 60); do
    if curl -s "localhost:$PORT/json/list" 2>/dev/null | grep -q 'app://obsidian.md'; then
      node "$HERE/sandbox-init.mjs" "$PORT"
      echo "sandbox $n up: DISPLAY=:$D CDP_PORT=$PORT vault=$V"
      return 0
    fi
    sleep 1
  done
  echo "sandbox $n didn't start; see $BASE/obs.log" >&2
  return 1
}

case $cmd in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  reset) stop; rm -rf "$V" "$P"; start ;;
  deploy)
    install_plugin "$ROOT" || exit 1
    CDP_PORT=$PORT node "$HERE/cdp.mjs" "(async()=>{await app.plugins.loadManifests(); await app.plugins.disablePlugin('$ID'); await app.plugins.enablePlugin('$ID'); return 'reloaded $ID'})()"
    ;;
  shot)
    # an absolute path: ImageMagick's security policy refuses paths with ../ in them
    f=$(realpath -m "${3:?file.png}")
    mkdir -p "$(dirname "$f")"
    DISPLAY=":$D" import -window root "$f"
    ;;
  *) usage ;;
esac
