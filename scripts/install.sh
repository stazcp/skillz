#!/usr/bin/env bash
# Install every plugin in this marketplace, with or without the mods.
#
#   scripts/install.sh [--with-mods] [--dry-run]
#
# Without a flag it installs the plain plugins (skills and agents), which work
# on any recent Claude Code. --with-mods also installs the mods: plugins that
# run a hooks module inside Claude Code (today, orc-ledger). Mods are optional,
# early access, and each needs the Claude Code version its plugin.json states
# under engines; one this Claude Code is too old for is left out, with a note.
#
# A mod is any plugin here with a "modules" entry in its hooks/hooks.json, so a
# new plugin needs no change to this script. Run it again at any time: plugins
# already installed are left as they are, and --with-mods adds the mods to an
# install made without them. To take a mod off again:
#   claude plugin uninstall orc-ledger@staz
#
# The list of plugins is read from this checkout; the plugins themselves come
# from the marketplace, which is refreshed first if you already have it.
# SKILLZ_MARKETPLACE overrides where a marketplace you do not have yet is added
# from (default stazcp/skillz on GitHub); point it at a checkout to install
# from disk.
#
# Exit: 0 all installed, 1 an install failed, 2 usage or setup error.
set -euo pipefail

SOURCE="${SKILLZ_MARKETPLACE:-stazcp/skillz}"
WITH_MODS=0
DRY=0

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --with-mods|--with-mod) WITH_MODS=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: $1 not found on PATH" >&2; exit 2; }; }
need claude
need python3

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROOT/.claude-plugin/marketplace.json"
[ -f "$CATALOG" ] || { echo "error: $CATALOG not found; run this from a checkout of the repo" >&2; exit 2; }

# One line per plugin: "<marketplace> <name> <plain|mod> <minimum Claude Code version, or ->".
LISTING="$(python3 -I - "$ROOT" <<'PY'
import json, os, re, sys

root = sys.argv[1]
catalog = json.load(open(os.path.join(root, ".claude-plugin", "marketplace.json")))
for plugin in catalog["plugins"]:
    kind, minimum = "plain", "-"
    source = plugin.get("source")
    # Only a plugin kept in this checkout can be looked at; any other is plain.
    if isinstance(source, str):
        folder = os.path.join(root, source)
        hooks = os.path.join(folder, "hooks", "hooks.json")
        if os.path.isfile(hooks) and json.load(open(hooks)).get("modules"):
            kind = "mod"
            manifest = json.load(open(os.path.join(folder, ".claude-plugin", "plugin.json")))
            stated = re.match(r">=\s*(\d+(?:\.\d+)*)$", str(manifest.get("engines", {}).get("claude-code", "")))
            if stated:
                minimum = stated.group(1)
    print(catalog["name"], plugin["name"], kind, minimum)
PY
)" || { echo "error: could not read the plugins listed in $CATALOG" >&2; exit 2; }
[ -n "$LISTING" ] || { echo "error: $CATALOG lists no plugins" >&2; exit 2; }
MARKETPLACE="${LISTING%% *}"

# True when version $1 is at least $2 (dotted numbers).
at_least() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)" = "$2" ]
}

VERSION=""
if [ "$WITH_MODS" = 1 ]; then
  VERSION="$(claude --version 2>/dev/null | sed -n 's/^\([0-9][0-9.]*\).*/\1/p' | head -1)" || true
  [ -n "$VERSION" ] || echo "warning: could not read the Claude Code version; a mod it is too old for will not load" >&2
fi

run() {
  if [ "$DRY" = 1 ]; then printf 'would run:'; printf ' %q' "$@"; printf '\n'; return 0; fi
  "$@"
}

# A marketplace already added is refreshed, so a plugin added since is found;
# adding it again would neither refresh it nor accept another source.
if claude plugin marketplace list --json 2>/dev/null | python3 -I -c '
import json, sys
sys.exit(0 if any(m.get("name") == sys.argv[1] for m in json.load(sys.stdin)) else 1)' "$MARKETPLACE" 2>/dev/null; then
  run claude plugin marketplace update "$MARKETPLACE" \
    || echo "warning: could not refresh the marketplace $MARKETPLACE; installing from the copy you have" >&2
else
  run claude plugin marketplace add "$SOURCE" || { echo "error: could not add the marketplace $SOURCE" >&2; exit 2; }
fi

installed=(); skipped=(); too_old=(); failed=()
while read -r marketplace name kind minimum; do
  [ -n "$name" ] || continue
  if [ "$kind" = mod ]; then
    if [ "$WITH_MODS" = 0 ]; then skipped+=("$name"); continue; fi
    if [ -n "$VERSION" ] && [ "$minimum" != - ] && ! at_least "$VERSION" "$minimum"; then
      too_old+=("$name (needs $minimum)"); continue
    fi
  fi
  if run claude plugin install "$name@$marketplace"; then installed+=("$name"); else failed+=("$name"); fi
done <<< "$LISTING"

echo ""
if [ "$DRY" = 1 ]; then label="Would install"; else label="Installed"; fi
echo "$label: ${installed[*]:-none}"
[ ${#skipped[@]} -eq 0 ] || echo "Left out (mods; add them with --with-mods): ${skipped[*]}"
if [ ${#too_old[@]} -gt 0 ]; then
  ( IFS=,; echo "Left out (this Claude Code is ${VERSION}; update it, then run this again): ${too_old[*]}" )
fi
if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi
[ "$DRY" = 1 ] || echo "Start a new Claude Code session, or run /reload-plugins, to pick them up."
