#!/usr/bin/env bash
# Tranche budget check — 400 soft / 600 hard net changed lines
# (docs/development-workflow.md §4–5). Counts insertions + deletions against a
# base ref, excluding lockfiles, generated code, and test fixtures. Rename
# detection is on, so pure moves cost nothing.
#
# Usage: check-diff-size.sh [base-ref] [--ci]
#   base-ref  defaults to origin/main (falls back to main)
#   --ci      emit GitHub Actions ::warning:: / ::error:: annotations
set -euo pipefail

SOFT=400
HARD=600
BASE="${1:-origin/main}"
CI="${2:-}"

git rev-parse --verify --quiet "$BASE" >/dev/null || BASE=main

EXCLUDES=(
  ':!package-lock.json' ':!**/package-lock.json'
  ':!yarn.lock'         ':!**/yarn.lock'
  ':!pnpm-lock.yaml'    ':!**/pnpm-lock.yaml'
  ':!bun.lock'          ':!bun.lockb'
  ':!**/dist/**' ':!**/build/**' ':!**/generated/**' ':!*.generated.*'
  ':!**/managed/**'
  ':!**/fixtures/**' ':!**/__snapshots__/**' ':!**/*.snap'
)

CHANGED=$(git diff -M --numstat "$BASE"...HEAD -- . "${EXCLUDES[@]}" \
  | awk '{ add += $1; del += $2 } END { print add + del + 0 }')

echo "Net changed lines vs $BASE (lockfiles/generated/fixtures excluded): $CHANGED"

if [ "$CHANGED" -gt "$HARD" ]; then
  MSG="Diff is $CHANGED lines — over the 600-line hard budget. Split this tranche (mn-passport-skills:pr-open)."
  if [ "$CI" = "--ci" ]; then echo "::error::$MSG"; else echo "HARD FAIL: $MSG"; fi
  exit 1
elif [ "$CHANGED" -gt "$SOFT" ]; then
  MSG="Diff is $CHANGED lines — over the 400-line soft budget. Consider splitting (mn-passport-skills:pr-open)."
  if [ "$CI" = "--ci" ]; then echo "::warning::$MSG"; else echo "WARN: $MSG"; fi
fi
exit 0
