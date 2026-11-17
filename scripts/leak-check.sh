#!/usr/bin/env bash
# Fail if a private term appears in anything this public repo would publish.
#
#   scripts/leak-check.sh --base <ref> [--text-env VAR]...   a change: base...HEAD
#   scripts/leak-check.sh --all                              the tree and all history
#
# --base scans what a PR publishes: the lines it adds, the paths it touches,
# its commit messages and its author and committer names and emails, plus any
# text passed by environment variable name with --text-env (a PR's title and
# body in CI). --all scans every tracked file at HEAD and every commit's
# message and identity on every ref.
#
# Terms come from $PRIVATE_TERMS (newline-separated; CI reads a repo secret),
# else from the file $PRIVATE_TERMS_FILE, default
# ${SKILLZ_CONTEXT:-~/.config/skillz}/private-terms. One per line, matched
# case-insensitively as fixed strings; blank lines and # comments are skipped.
# The list itself never belongs in this repo.
#
# Output names where a term matched and its number in the list, never the
# term or the matching text: CI logs on a public repo are public too.
#
# Exit: 0 clean, 1 a term matched, 2 usage error or no terms configured.
set -euo pipefail

BASE=""; ALL=0; TEXT_VARS=()
usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ $# -ge 2 ] || { echo "--base needs a ref" >&2; exit 2; }; BASE="$2"; shift ;;
    --all) ALL=1 ;;
    --text-env) [ $# -ge 2 ] || { echo "--text-env needs a variable name" >&2; exit 2; }; TEXT_VARS+=("$2"); shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
if [ "$ALL" = 1 ] && [ -n "$BASE" ]; then echo "--all and --base are exclusive" >&2; exit 2; fi
if [ "$ALL" = 0 ] && [ -z "$BASE" ]; then usage >&2; exit 2; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/leak-check.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

# ---------- terms ----------
TERMS="$WORK/terms"
if [ -n "${PRIVATE_TERMS:-}" ]; then
  printf '%s\n' "$PRIVATE_TERMS" > "$TERMS.raw"
else
  f="${PRIVATE_TERMS_FILE:-${SKILLZ_CONTEXT:-$HOME/.config/skillz}/private-terms}"
  if [ ! -f "$f" ]; then
    echo "leak-check: no private terms configured (set PRIVATE_TERMS, or create $f). Refusing to vouch for a scan with nothing to look for." >&2
    exit 2
  fi
  cat "$f" > "$TERMS.raw"
fi
# Trim, drop blanks and comments, strip CR from a secret pasted on Windows.
tr -d '\r' < "$TERMS.raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v -e '^$' -e '^#' > "$TERMS" || true
NTERMS="$(wc -l < "$TERMS" | tr -d ' ')"
if [ "$NTERMS" -eq 0 ]; then
  echo "leak-check: the private term list is empty. Refusing to vouch for a scan with nothing to look for." >&2
  exit 2
fi

# ---------- what would be published ----------
# One record per line: <where>\t<text>. <where> is shown on a hit, so a path
# that itself holds a term is withheld below rather than printed.
REC="$WORK/records"; : > "$REC"

emit_added_lines() {  # stdin: git diff -U0 output
  awk '
    /^\+\+\+ / { path = substr($0, 5); sub(/^b\//, "", path); next }
    /^@@ / { split($3, a, ","); line = substr(a[1], 2) + 0; next }
    /^\+/ { printf "%s:%d\t%s\n", path, line, substr($0, 2); line++; next }
  '
}

if [ "$ALL" = 1 ]; then
  # Every tracked text file at HEAD; -I skips binaries, which are named below.
  git grep -I -n -e '' HEAD -- . | sed -E 's/^HEAD:([^:]*):([0-9]+):/\1:\2\t/' >> "$REC" || true
  git ls-files | awk '{ printf "file name %s\t%s\n", $0, $0 }' >> "$REC"
  RANGE=(--all)
else
  git rev-parse --verify -q "$BASE^{commit}" >/dev/null || { echo "leak-check: base $BASE is not a commit here (fetch it first)" >&2; exit 2; }
  git diff -U0 --no-color --no-ext-diff "$BASE...HEAD" | emit_added_lines >> "$REC"
  git diff --name-only "$BASE...HEAD" | awk '{ printf "file name %s\t%s\n", $0, $0 }' >> "$REC"
  # Uncommitted work too, so a local run sees what is about to be committed.
  git diff -U0 --no-color --no-ext-diff HEAD | emit_added_lines >> "$REC"
  git ls-files --others --exclude-standard | while IFS= read -r f; do
    [ -f "$f" ] || continue
    printf 'file name %s\t%s\n' "$f" "$f"
    if grep -Iq . "$f" 2>/dev/null; then awk -v p="$f" '{ printf "%s:%d\t%s\n", p, NR, $0 }' "$f"; fi
  done >> "$REC"
  RANGE=("$BASE..HEAD")
  for v in "${TEXT_VARS[@]+"${TEXT_VARS[@]}"}"; do
    printf '%s\n' "${!v:-}" | awk -v v="$v" '{ printf "$%s line %d\t%s\n", v, NR, $0 }' >> "$REC"
  done
fi
# Commit messages and identities in the range. %x09 is a tab.
git log "${RANGE[@]}" --format='commit %h identity%x09%an <%ae> / %cn <%ce>' >> "$REC"
# Messages, one commit at a time: every line of the body, not just the
# subject, and no awk record-separator tricks (BSD awk keeps only line one).
git rev-list "${RANGE[@]}" | while IFS= read -r c; do
  h="$(git rev-parse --short "$c")"
  git log -1 --format=%B "$c" | awk -v h="$h" 'NF { printf "commit %s message\t%s\n", h, $0 }'
done >> "$REC"

# ---------- match ----------
HITS="$WORK/hits"
awk -F'\t' -v OFS='\t' '
  NR == FNR { n++; term[n] = tolower($0); next }
  {
    where = $1; text = tolower(substr($0, length($1) + 2))
    lw = tolower(where); masked = 0
    for (i = 1; i <= n; i++) if (index(lw, term[i])) masked = 1
    if (masked) where = "(a location whose name holds a term)"
    for (i = 1; i <= n; i++) if (index(text, term[i]) || index(lw, term[i])) print i, where
  }
' "$TERMS" "$REC" | sort -u > "$HITS"

if [ -s "$HITS" ]; then
  echo "leak-check: FAIL, private terms found ($(wc -l < "$HITS" | tr -d ' ') hit(s), of $NTERMS terms):"
  awk -F'\t' '{ printf "  term #%s in %s\n", $1, $2 }' "$HITS" | head -100
  echo "Term numbers are positions in the private list; the terms themselves are never printed."
  exit 1
fi
scope="$BASE...HEAD"; [ "$ALL" = 0 ] || scope="the tree at HEAD and all history"
echo "leak-check: clean ($NTERMS terms, $scope)"
