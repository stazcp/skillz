#!/usr/bin/env bash
# Thin wrapper kept for old callers: the leak scanner is scripts/leak-check
# (Python 3, stdlib only). See `scripts/leak-check --help`.
exec python3 -I "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/leak-check" "$@"
