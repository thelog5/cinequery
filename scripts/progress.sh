#!/usr/bin/env bash
# Append a row to docs/PROGRESS.md for the commit at HEAD.
# Usage: scripts/progress.sh "Block name" "optional notes"
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
file=docs/PROGRESS.md
n=$(( $(grep -cE '^\| [0-9]+ \|' "$file" || true) + 1 ))
when=$(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M')
hash=$(git log -1 --format=%h)
printf '| %s | %s | %s | `%s` | %s |\n' "$n" "$when" "$1" "$hash" "${2:-}" >> "$file"
