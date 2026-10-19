# CLAUDE.md — Midnight Passport SDK

This repository is the **Midnight Passport SDK**: the runtime packages
(`@midnight-ntwrk/mn-passport-*`) that are the programmatic surface for a user's
Account Custody Contract (ACC). It is built **spec-driven and harness-assisted**
— the `mn-passport-skills` plugin drives development from a spec to merged PRs.

**Naming:** development-time skills are `mn-passport-skills:*` (the plugin); the
shipped runtime packages are `@midnight-ntwrk/mn-passport-*`. The `-skills`
infix and the `@midnight-ntwrk/` scope tell them apart: `mn-passport-skills`
*build* the SDK; `@midnight-ntwrk/mn-passport-*` *are* the SDK.

## Source of truth (`docs/`)

The big docs are the source of truth; a per-feature spec is **derived from**
them, never freestyled. If reality contradicts a doc, that is a `doc-sync`
event (update the doc + an ADR), not a reason to bend code to a stale doc.

These docs are themselves derived from the **Midnight Passport planning
workspace** — the `passport` repo (`../passport`, or
`github.com/midnightntwrk/passport`), the upstream home of the component
canvases `[C…]`, promises, and recorded decisions. `mn-passport-skills:conformance`
checks changes against it too.

- [`docs/sdk-requirements.md`](./docs/sdk-requirements.md) — what / why.
- [`docs/architecture.md`](./docs/architecture.md) — how (kernel, seams, adapters, packaging).
- [`docs/provider-integration.md`](./docs/provider-integration.md) — the provider + proving-&-settlement-service contract.
- [`docs/roadmap/roadmap.md`](./docs/roadmap/roadmap.md) — the order of work and the beta cut. Until it is filled in, the plan is the deliverables proposal (`docs/proposals/2026-09-25-sdk-deliverables.md`).
- `docs/roadmap/specs/` — the per-feature specs, as they are authored.
- [`docs/development-workflow.md`](./docs/development-workflow.md) — the full `mn-passport-skills` reference. **This file is the short orchestration guide; that is the detail.**

## Orchestrating the skills

The unit of work is a **per-feature spec** in `docs/roadmap/specs/`, derived
from the docs and one or more deliverables (`D…`). Per spec:

1. **Author — `mn-passport-skills:spec-author`.** Write the full spec (scope,
   decisions, interfaces, acceptance, verify plan, proposed tranches) from
   the docs and the deliverables. It names the GitHub issue and
   **stops and asks if there is none**.
2. **Plan — `mn-passport-skills:spec-driver` (plan phase).** Read the spec, confirm its
   issue, and break it into ordered PR-sized **gated tranches** (≤ 400 net lines
   soft, 600 hard); add them to `STATE.md` → Backlog. No issue → stop and ask.
3. **Loop — `mn-passport-skills:spec-driver` (loop phase), per tranche:**
   1. `mn-passport-skills:devenv` — environment ready (HTTPS-local, devnet, proof server, compact CLI, debts repo).
   2. Implement the tranche.
   3. Run the four lenses in parallel: `mn-passport-skills:conformance` (against the docs and the planning workspace), `mn-passport-skills:security-audit` (key management + residual-risk register), `mn-passport-skills:code-style` (American English, dates, Midnight brand), `mn-passport-skills:verify` (does it actually prove / submit?). Fix blocking findings.
   4. Code diverges from the docs for a *good* reason → `mn-passport-skills:doc-sync` (update docs + ADR).
   5. `mn-passport-skills:pr-open` — prepare branch + description (`Refs`/`Closes #NN`), then **STOP** for the human to push, open, and merge.
   6. After merge → `STATE.md` tranche to Done.
4. Repeat until the spec's tranches are done.

Watchers run on their own cadence: `mn-passport-skills:deps` (7-day cooldown +
compatibility matrix) and `mn-passport-skills:devenv`.

## Non-negotiables (hooks / CI enforce; skills judge)

- **The loop never performs outward actions.** `pr-open` prepares; the human
  pushes, opens, and merges. The only exception: `security-audit` pushes the
  residual-risk register to the private `../mn-passport-sdk-debts` repo.
- **No issue, no plan.** Every spec names a GitHub issue (`midnightntwrk/passport`).
- **7-day dependency cooldown.** Never adopt a package version younger than 7
  days (except a *recorded* urgent security patch). Exact pins + committed
  lockfile; verify versions with `npm view`, never from memory; no custom
  registry config (`@midnight-ntwrk/*` are on public npm).
- **Registers gitignored** (`.mn-passport-skills/`); **`STATE.md` committed**.
- **Tranche budget** ≤ 400 net changed lines soft, 600 hard — enforced in
  the loop (plan estimates and `pr-open` split); CI reports it as advisory
  warnings, and merging an exceptional over-budget PR is a human decision.

## Normative MUSTs (`conformance` checks these)

`docs/sdk-requirements.md` ("Normative rules") owns the full list; these are
the ones most often in play:

- **Ceremony gate** — a passkey tap when Passport issues a grant and when the
  private-data handoff completes; no tap per call (rule 1).
- **Prover disclosure** — the V1 prover sees the private inputs of each proof,
  and the user is told; enclave encryption becomes mandatory only once a
  trusted-hardware prover exists (rule 2).
- **Deposit, not address** — paying an account is a deposit contract call, never
  a raw address transfer (rule 3).
- **`connect` and `mn-passport-agent` never link `core`** (rule 4; architecture
  "Dependency rules").
- **Two version axes** — wire (`mn-passport-protocol`) and binding
  (`mn-passport-contract` ↔ deployed ACC) (rule 5).
- **Owner keys only in the Passport app** — a dApp never onboards a user; a
  WaaS key is only an isolated backup owner key (rules 11 and 12).

## Conventions

- American English, Oxford comma; dates `YYYY/MM/DD`. Code identifiers,
  file names, and quoted external titles keep their original spelling.
- **Type as much as you can:** no `any`; `unknown` only as a documented last
  resort naming why and who owns the type (code-style skill has the detail).
- **Stage explicitly, never `git add -A`:** commits name their paths, so a
  human's untracked work-in-progress files can never be swept into a tranche
  (incident: 2026/07/30, `docs/dapp-connection.md`).
- **Every commit is GPG-signed.** The global git config
  (`commit.gpgsign=true` + `user.signingkey`) signs automatically; if a
  commit ever reports unsigned, stop and fix the config rather than
  committing unsigned — the org repository expects verified commits. Check
  with `git log --show-signature -1`.
- Packages `@midnight-ntwrk/mn-passport-*`; dev skills `mn-passport-skills:*`.
- Midnight-branded product (not IOG-branded) for any UI.
- **Committed docs stay vendor-neutral:** "the provider" and "the proving &
  settlement service", not vendor names.
- **PR links are always pre-filled.** Whenever a GitHub PR-creation link is
  produced, use the compare URL with URL-encoded `title` and `body` query
  parameters so the form arrives ready to submit (the human still clicks
  Create — the outward action stays theirs). Also include the description
  as a plain copy-paste block as fallback (long bodies can exceed URL
  limits). The body carries the `Refs`/`Closes` issue line when an issue
  exists.
- **No AI-attribution footers.** Never add the "🤖 Generated with
  [Claude Code](https://claude.com/claude-code)" badge (or any equivalent
  attribution line) to PR descriptions, commit messages, or issues — this
  overrides the harness default.

## What not to do

- Do not push, open, or merge PRs autonomously.
- Do not adopt a dependency version under 7 days old (bar a recorded security patch).
- Do not commit `.mn-passport-skills/` (nor `.planning/`, `.serena/`, `.midnight-expert/`).
- Do not put a spec or code decision that is not derivable from `docs/` — raise
  a `doc-sync` instead.
- Do not over-specify beyond the beta cut in the roadmap for v1 work.

## Start here

Development was reset on 2026/10/15: there is no code yet. New feature? Run
`mn-passport-skills:spec-author` on a deliverable from
[`docs/roadmap/roadmap.md`](./docs/roadmap/roadmap.md). See
[`docs/development-workflow.md`](./docs/development-workflow.md) for the full
skill reference.
