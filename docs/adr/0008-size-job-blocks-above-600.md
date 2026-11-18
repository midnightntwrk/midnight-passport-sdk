# 0008 — The size job blocks above 600, with a PR-body override

Date: 2026/11/18 · Status: proposed
Refs: issue #80; `docs/development-workflow.md`, sections "Enforcement (hooks
and CI)" and "Ship"; `mn-passport-skills/scripts/check-dep-cooldown.mjs` (the
`Cooldown-override:` precedent).

## Context

The tranche budget is 400 net changed lines soft and 600 hard. In CI the
`diff-size` job only warned, even above 600, so the hard limit was advisory.
Issue #80 asks for a hard CI failure above 600, with a documented exception in
the PR body.

## Decision

1. The `diff-size` job fails above 600 counted lines. The 400-line case stays a
   warning that passes. The exclusions do not change: lockfiles, generated
   code, test fixtures, and `experiments/` do not count.
2. A `Budget-override: <reason>` line in the PR body turns an above-600 failure
   into a warning that passes and records the reason. The script parses it like
   `Cooldown-override:`: one line, a non-empty reason, horizontal whitespace
   only around the token, and a CRLF body parses. Any author may add the line.
   As with the cooldown override, the reviewer grants it by approving.
3. One rule covers CI and local. `--ci` only switches the output to GitHub
   Actions annotations. Locally the script reads no PR body, so it fails above
   600. `pr-open` then splits the tranche or records the override in the PR
   body it prepares.
4. The `diff-size` job passes `PR_BODY`, as the `dep-cooldown` job already does,
   so the override line reaches the script.

## Consequences

- The SDK `CLAUDE.md` budget bullet, `docs/development-workflow.md`
  ("Enforcement (hooks and CI)", "Ship", and the human-decision line), and the
  `mn-passport-skills:pr-open` skill state the blocking behavior and the
  override. `check-diff-size.sh` no longer says "Advisory in CI".
- Keep `diff-size` a non-required branch-protection check, so a maintainer can
  still merge a red one when the team must. This repo cannot enforce that:
  branch protection is a repository setting. If the team later makes the check
  required, the override line is the only route, and it still records the
  reason.
- A `pull_request` run takes the workflow and the script from the PR's own ref.
  PR 122 does not carry this change, so it keeps the old warn-only behavior. The
  new rule applies only to a PR that carries this change.
- It mirrors the `Cooldown-override:` rules of the cooldown check, `check-dep-cooldown.mjs`.
- The bash parser is not byte-for-byte the JS one. A non-breaking space, an em
  space, or U+2028 counts as whitespace for JS `\S` but not for the bash
  `[^[:space:]]` class. JS trims both ends of the reason, and bash trims only
  the start. We accept the gap, because no real reason uses those characters.
