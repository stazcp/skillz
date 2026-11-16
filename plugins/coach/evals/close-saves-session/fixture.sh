#!/usr/bin/env bash
# Builds a throwaway brain home, vault and coach config for this run. Never
# touches real vaults: refuses to run unless HOME is the eval's temporary home.
# The replayed session (history.jsonl) must match the current SKILL.md.
set -euo pipefail
case "$HOME" in /Users/*|/home/*|/root|"") echo "refusing: HOME=$HOME is not a temp home" >&2; exit 1;; esac
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$HERE/make-history.sh" --check
for d in "$HOME/.config/brain" "$HOME/.config/skillz"; do
  if [ -e "$d" ]; then echo "refusing: $d already exists" >&2; exit 1; fi
done
VAULT="$PWD/vault"
mkdir -p "$VAULT/Career/Coaching" "$VAULT/Inbox" "$HOME/.config/brain" "$HOME/.config/skillz"
cat > "$VAULT/Career/Career Facts.md" <<'MD'
---
date: 2026-09-12
tags: [career]
---
# Career Facts

- Senior software engineer, 7 years, mostly backend and infra.
- Goal: an AI product engineering role at staff level by mid-2027.
- Rule after the 2024 burnout: no roles where I'm primary on-call.
MD
cat > "$VAULT/Career/Coaching/2026-11-02 Coaching - Job search plan.md" <<'MD'
---
date: 2026-11-02
tags: [coaching]
---
# 2026-11-02 Coaching - Job search plan

## Decisions
- Target AI product teams only; skip pure infra roles.

## Commitments
- [ ] Ask Dana for a referral to the Northwind applied AI team by 2026-11-10
- [ ] Rewrite the CV summary around product impact by 2026-11-09

## Links
- [[Career Facts]]
MD
cat > "$HOME/.config/brain/eval.md" <<MD
# Vault spec

## Vault

- **Name**: eval
- **Path**: \`$VAULT\`
- **Private**: yes
- **Git**: none
- **Sandbox**: writes inside the workspace are allowed
- **Backup**: none

## What belongs

Personal notes, career and job search.

## Never here

Employer-confidential material.

## Conventions

- **Filename**: a plain title
- **Frontmatter**: \`date\` and \`tags\`
- **Appending**: dated \`## YYYY-MM-DD\` section

## Filing

- Career notes go in \`Career/\`.
- **Index**: none
- **Inbox**: \`Inbox/\`
- **Archive**: none

## Daily log

Off

## Recall

Nothing to read first.
MD
echo eval > "$HOME/.config/brain/active"
cat > "$HOME/.config/skillz/coach.md" <<'MD'
# Coach config

## Vault

eval

## Context

- `Career/Career Facts.md`

## Sessions

`Career/Coaching`

## Preferences

- Be blunt.
MD
