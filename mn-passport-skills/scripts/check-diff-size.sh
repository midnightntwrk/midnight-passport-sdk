#!/usr/bin/env bash
# Tranche budget check — 400 soft / 600 hard net changed lines
# (docs/development-workflow.md §4–5). Counts insertions + deletions against a
# base ref, excluding lockfiles, generated code, test fixtures, and the
# standalone experiments/ tree (not tranche work). Rename detection is on,
# so pure moves cost nothing.
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
  ':!experiments'
)

CHANGED=$(git diff -M --numstat "$BASE"...HEAD -- . "${EXCLUDES[@]}" \
  | awk '{ add += $1; del += $2 } END { print add + del + 0 }')

echo "Net changed lines vs $BASE (lockfiles/generated/fixtures/experiments excluded): $CHANGED"

if [ "$CHANGED" -gt "$HARD" ]; then
  # Swap CR for a line end. A bare CR then starts a line, and a trailing CR
  # stays out of the reason.
  body=${PR_BODY:-}
  body=${body//$'\r'/$'\n'}
  override=$(grep -im1 -E '^[[:blank:]]*budget-override:[[:blank:]]*[^[:space:]]' <<<"$body" || true)
  if [ -n "$override" ]; then
    # The reason is the text after the token, with leading blanks removed.
    reason=${override#*:}
    reason=${reason#"${reason%%[![:blank:]]*}"}
    MSG="Diff is $CHANGED lines, over the 600-line budget. Budget-override in effect: $reason"
    if [ "$CI" = "--ci" ]; then echo "::warning::$MSG"; else echo "WARN: $MSG"; fi
  else
    MSG="Diff is $CHANGED lines, over the 600-line budget. Split it, or add a 'Budget-override: <reason>' line to the PR body."
    if [ "$CI" = "--ci" ]; then echo "::error::$MSG"; else echo "FAIL: $MSG"; fi
    exit 1
  fi
elif [ "$CHANGED" -gt "$SOFT" ]; then
  MSG="Diff is $CHANGED lines — over the 400-line soft budget. Consider splitting (mn-passport-skills:pr-open)."
  if [ "$CI" = "--ci" ]; then echo "::warning::$MSG"; else echo "WARN: $MSG"; fi
fi
exit 0
