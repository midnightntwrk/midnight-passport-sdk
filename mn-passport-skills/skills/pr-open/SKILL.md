---
name: pr-open
description: Prepare a Midnight Passport SDK tranche for shipping — size-check the diff against the 400/600 budget, prepare branch, commits, and PR description linked to the spec's GitHub issue, then STOP for explicit human confirmation. Never pushes or opens the PR itself. Use when a tranche has passed its lenses.
---

# pr-open — prepare, then stop

The ship step (`docs/development-workflow.md` §2). It **prepares** the
branch, commits, and description, then **stops** — pushing and opening the
PR is the human's action. A PreToolUse hook backs this: any `git push`,
`gh pr create/merge`, or `npm publish` from the harness forces a
confirmation prompt. Do not attempt to route around it.

## 1. Size check (the backstop to plan-phase estimates)

```bash
bash mn-passport-skills/scripts/check-diff-size.sh   # same script and numbers as CI
```

- **> 600** net changed lines (lockfiles/generated/fixtures excluded):
  stop and split. Propose a split along reviewable concerns — by layer
  (foundation / core / adapter), by flow, or by file group — such that each
  part builds and tests green on its own.
- **> 400**: warn and suggest a split; proceeding is allowed only with a
  one-line justification recorded in the PR description's Size section.

## 2. Branch and commits

- Branch: `feat/NN-<slug>` (NN = the spec's issue number); `fix/` or
  `docs/` prefix where truer.
- Commits in reviewable units with imperative messages.
- Confirm nothing from `.mn-passport-skills/` or any register/secret material is
  staged.

## 3. PR description

```markdown
## What
<one paragraph: what this tranche builds, and why — written for the reviewer>

## Spec
- Spec / tranche: <spec file or plan link, tranche id>
- Refs midnightntwrk/passport#NN   <!-- Closes #NN on the finishing tranche -->

## Lens results
- conformance: <pass / N findings fixed / divergence → ADR NNNN>
- security-audit: <pass / N residual-risk entries recorded (private register)>
- code-style: <pass / notes>
- verify: <flows run end-to-end and against what; register entries added>

## Size
<N net changed lines (excl. lockfiles/generated/fixtures)>
<justification if over 400>
```

CI will reject a description without a `Refs #NN` / `Closes #NN` issue
reference, and re-run the same size and cooldown checks.

## 4. Stop

Present the branch name, the commit list, and the description to the human,
and stop. After they push and open the PR, the hooks/CI gate runs and they
review and merge; `mn-passport-skills:spec-driver` then updates `STATE.md` and moves
to the next tranche.

## PR link convention

Always hand the human a **pre-filled compare URL**: URL-encode the PR title
and full description into the `title` and `body` query parameters
(`https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1&title=…&body=…`)
so the form arrives ready to submit — the human still performs the outward
action. Include the description as a plain copy-paste block as well (very
long bodies can exceed URL limits, and the block survives link mangling).
The body must contain the `Refs`/`Closes` issue reference the CI
description gate checks.
