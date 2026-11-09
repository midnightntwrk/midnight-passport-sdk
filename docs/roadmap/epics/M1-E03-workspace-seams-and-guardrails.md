# E03 · Workspace, seams, and guardrails

**Issue:** [#46](https://github.com/midnightntwrk/midnight-passport-sdk/issues/46)  
**Milestone:** 1 Foundation · **Track:** SDK, owner and foundation · **Steps:** 1–5 · **Stories:** 9  
**Packages:** `owner`, `connect`, `agent`, `core`, `contract`, `protocol`  
**Sheet code:** E2  
**Readiness:** ready, no story marked to discuss

## Goal

Create the SDK repository skeleton: the packages, the seams between them, and the automated checks that keep the design boundaries in place, before any feature code exists.

## Description

The architecture defines a small set of packages with strict rules about who may import whom, a kernel that is the only place holding secrets, and seams where adapters plug in. If those boundaries are not enforced from the first commit, they erode with the first feature. This epic builds them as code and as CI checks.

**Packages.** The workspace gets one package per entry library and foundation package: `mn-passport-owner` (the Passport app library), `mn-passport-connect` (dApps), `mn-passport-agent` (agents on Node.js), `mn-passport-core` (the shared ACC client), `mn-passport-contract` (typed bindings), and `mn-passport-protocol` (the wire messages). Each builds, tests, and publishes on its own, with TypeScript project references.

**Seams.** The seams are typed interfaces that adapters implement: the prover, broadcast, key provider, storage, platform, and indexer seams in `core`, and the recovery and DID seams in `owner`. Reads are observable and writes are imperative, so the shape already fits the later design.

**The owner kernel boundary.** Only the kernel in `owner` holds the PRF output, the device key, the WPP account key, the viewing key, and the recovery secret in plaintext. Everything else receives signatures or ciphertext. Secrets never appear in logs or errors, and buffers are zeroed after use.

**Version axes.** Two independent versions: the wire version (`PROTOCOL_VERSION` in `protocol`) and the binding version (`contract` against the deployed ACC). They never share one number (rule 5).

**Guardrails.** CI enforces the dependency rules (`connect` and `agent` never link `owner`, rule 4) with `scripts/lint-boundaries.mjs` and `tests/dependency-rules.test.mjs`, checks formatting and the PR size budget, pins every dependency exactly with a 7-day cooldown, and publishes signed releases. The domain-separation tags live in `protocol`, so a signature for one purpose can never be replayed for another.

## Scope

**In:** the package scaffold, the seam interfaces, the kernel boundary, the version axes, the CI guardrails, the dependency pins, the release pipeline, the domain-separation tags, and secret hygiene.

**Out:** any adapter implementation (E04 and later), and any feature logic.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E03.01 | Exact pins, 7-day cooldown, lockfile | 1 | repo |
| E03.02 | Monorepo scaffold for mn-passport-* packages | 3 | owner, connect, agent, core, contract, protocol |
| E03.03 | Seam interface definitions | 4 | core, owner |
| E03.04 | Owner kernel secret boundary | 4 | owner |
| E03.05 | Wire and binding version axes | 4 | protocol, contract |
| E03.06 | CI boundary lint and PR budget checks | 4 | repo |
| E03.07 | Signed npm release pipeline | 4 | repo |
| E03.08 | Domain-separation tag constants | 4 | protocol |
| E03.09 | Secret redaction and zeroization | 5 | owner, core |

## Dependencies

**Blocked by:**
- E01 Review and alignment: E01.03 Roadmap sign-off and issue filing

**Unlocks:** E04 Account deployment (6 stories), E05 Contract binding (2 stories), E09 Scoped grants foundation (4 stories), E13 Private data and backup (2 stories), E14 Devices and multi-device sync (1 story), E16 Guardian recovery (1 story), E24 Cross-chain assets (1 story).

**Parallel with:** E02 Passport app: brand and identity, E06 Passport app: onboarding.

## Exit criteria

- All six packages build, test, and publish a pre-release from CI.
- A test import of `owner` from `connect` or `agent` fails CI.
- The seam interfaces compile and have stub implementations for local development.
- A release is signed and reproducible from a clean checkout.

## Verification plan

- The dependency-rules tests and the boundary lint run on every PR.
- A deliberate boundary violation and an unpinned dependency are both rejected by CI.
