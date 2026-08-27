---
name: spec-driver
description: Drive a Midnight Passport SDK feature spec from plan to merged PRs. Use when starting work on a per-feature spec, planning tranches, running or resuming the tranche loop, or updating STATE.md. Plans PR-sized tranches (400 soft / 600 hard line budget) anchored to a GitHub issue, then loops implement → lenses → pr-open → stop for human review.
---

# spec-driver — plan, then loop

The spine of the mn-passport-skills workflow (`docs/development-workflow.md` §2–3).
The unit of work is a **per-feature spec** derived from
`docs/sdk-requirements.md` + `docs/architecture.md` (v1 scope:
`docs/beta-scope.md`). Those docs are the source of truth; the spec is what
gets driven.

## Hard rules

1. **No issue, no plan.** Every spec must name a GitHub issue from
   [midnightntwrk/passport](https://github.com/midnightntwrk/passport/issues).
   If the spec names none, STOP and ask the user for it before any planning —
   no untraceable work.
2. **Tranche budget.** Each tranche targets **≤ ~400 net changed lines**
   (insertions + deletions, excluding lockfiles, generated code, the
   standalone `experiments/` tree, and test
   fixtures); **hard split above 600**. Every tranche in the plan carries a
   size estimate (files touched, rough net lines). A plan containing an
   over-budget tranche is **invalid** — re-split before presenting it. The
   estimate is what lets the human catch an oversized tranche at plan review,
   before code exists.
3. **One reviewable concern per tranche.** A human must be able to review it
   in one sitting.
4. **Never perform outward actions.** `pr-open` prepares branches and
   descriptions; the human pushes, opens, and merges (hook-enforced). The one
   exception: `security-audit` pushes the security register to the private
   `../mn-passport-sdk-debts` repo.

## Plan phase

1. Read the spec. Confirm its issue (`Refs midnightntwrk/passport#NN`).
   Missing → stop and ask.
2. Consult the `mn-passport-skills:conformance` rules so the plan aligns with the
   architecture up front: respect the layering (foundation → core → adapters
   → connect) and the package-dependency rules, so each tranche builds and
   tests green on its own.
3. Break the spec into an **ordered** list of tranches. For each record:
   - **Goal** — the one concern it delivers.
   - **Files expected** and **size estimate** (~net lines, per the budget).
   - **Acceptance gate** — an observable criterion (compiles, named test
     passes, flow runs end-to-end via `mn-passport-skills:verify`).
4. Present the plan to the human for review. Persist it (`.planning/` or the
   spec file) and add all tranches to `STATE.md` → Backlog.

## Loop phase (per tranche)

a. `mn-passport-skills:devenv` — confirm the environment is ready (includes the
   debts-repo check).
b. `STATE.md`: move the tranche to **In progress**.
c. Implement the tranche. If implementation reveals the estimate was wrong
   and the diff is heading past 600 excluded-adjusted lines, stop and split —
   do not plough on.
d. Run the four lenses — `mn-passport-skills:conformance`, `mn-passport-skills:security-audit`,
   `mn-passport-skills:code-style`, `mn-passport-skills:verify` — in parallel via subagents
   where available. Fix blocking findings, then re-run the affected lens.
e. If conformance found the code diverging from the docs for a *good* reason
   → `mn-passport-skills:doc-sync` (update docs + ADR). The docs are corrected, not
   the code bent to a stale doc.
f. `mn-passport-skills:pr-open` — prepare branch, commits, and description, then
   **STOP for the human** to review, push, and merge.
g. After merge: `STATE.md` tranche → **Done** (with PR and issue links);
   proceed to the next tranche.

A tranche that slips, blocks, or is descoped goes to **Backlog with a
reason** — never silently dropped.

## STATE.md (repo root, committed)

Three sections, every entry carrying its issue number:

- **Done** — completed tranches, each with PR and issue links.
- **In progress** — the single tranche currently in the loop.
- **Backlog** — planned but not completed, each with a reason.

Update it on every tranche transition, and refresh the `Last updated` date.
