---
name: deps
description: Upstream-dependency watcher for the Midnight Passport SDK — 7-day supply-chain cooldown, exact version pins, upstream drift checks, and the compatibility matrix for the two version axes. Use when adding or bumping any dependency, when a Midnight component releases, or for a scheduled drift check.
---

# deps — upstream drift and supply-chain hygiene

Midnight breaks often, and the SDK pins midnight-js / ledger / zkir /
compact **and** the ACC artefact (arch §8.2). This skill keeps those pins
honest and the adoption path safe (`docs/development-workflow.md` §2).

## The 7-day cooldown (non-negotiable default)

Never adopt a package version published **less than 7 days ago** — the
window in which a supply-chain compromise is most often caught and yanked.

Before any new dependency or version bump:

```bash
npm view <name> time --json    # registry publish times — the only source of truth
```

If the target version is inside the window: pick the newest version outside
it, or wait. The **only** override is an urgent security patch, taken as a
conscious, recorded decision: add `Cooldown-override: <reason>` to the PR
description (CI reads exactly that line; without it, a quarantined version
fails the gate).

## Hygiene rules

- **Exact pins** — no `^` / `~`; the lockfile is committed.
- **Verify with `npm view`, never from memory** — versions, publish dates,
  and deprecations.
- **No custom registry configuration** — no `.npmrc` / `.yarnrc.yml`
  registry overrides; `@midnight-ntwrk/*` are on public npm.

## Watch list

`@midnight-ntwrk/*` (midnight-js packages, ledger, zkir-v2,
dapp-connector-api, compact runtime/toolchain, midnight-did packages), the
**ACC artefact** (arch §8.2 — versioned, externally owned), WingRiders
`ows-core` (§3.8), and the Capacity Exchange SDK (§3.11).

For drift checks: `compact check` / `compact self check`, the
`midnight-tooling:release-notes` skill for component release notes, and the
`midnight-tooling:troubleshooting` skill when a bump breaks. Findings become
plan/backlog items via `mn-passport-skills:spec-driver` — never silent bumps inside
an unrelated tranche.

## The compatibility matrix (two axes — never conflate them)

Maintained at `docs/compatibility.md` (create on first entry):

| Axis | Between | Owned by |
|---|---|---|
| **Wire** | dApp connector ↔ wallet (C23 messages) | `mn-passport-protocol` (`PROTOCOL_VERSION`) |
| **Binding** | SDK contract bindings ↔ deployed ACC | `mn-passport-contract` (arch §8.2 compatibility contract) |

Any upstream bump that shifts either axis updates the matrix **in the same
PR**. A wire change never implies a binding change, and vice versa
(arch §4.6).
