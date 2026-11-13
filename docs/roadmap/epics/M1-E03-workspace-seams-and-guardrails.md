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

**The owner kernel boundary.** The device key is a passkey and never leaves the authenticator. Only the kernel in `owner` holds the account's other secrets in plaintext: the WPP account key, the viewing key, and the recovery secret. Everything else receives signatures or ciphertext. Secrets never appear in logs or errors, and buffers are zeroed after use; this secret hygiene is part of the kernel story.

**Effect 4 inside.** The SDK is written with Effect 4, bundled inside its own build, while midnight-js and the wallet SDK use Effect 3. One adapter file in `core` is where the two meet, and the public API is Promises and plain types, with a CI guard that keeps Effect out of the published types. This is decided and built before any seam signature is written.

**Version axes.** Two independent versions: the wire version (`PROTOCOL_VERSION` in `protocol`) and the binding version (`contract` against the deployed ACC). They never share one number (rule 5).

**Guardrails.** CI enforces the dependency rules (`connect` and `agent` never link `owner`, rule 4) with `scripts/lint-boundaries.mjs` and `tests/dependency-rules.test.mjs`, checks formatting and the PR size budget, pins every dependency exactly with a 7-day cooldown, and publishes signed releases. The domain-separation tags live in `protocol`, so a signature for one purpose can never be replayed for another.

## Scope

**In:** the package scaffold, the seam interfaces, the kernel boundary, the version axes, the CI guardrails, the dependency pins, the release pipeline, the domain-separation tags, secret hygiene, and the Effect 4 bundling.

**Out:** any adapter implementation (E04 and later), and any feature logic.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E03.01 | Exact pins, 7-day cooldown, lockfile: the remaining work | 1 | repo |
| E03.02 | Monorepo scaffold for mn-passport-* packages | 3 | all packages |
| E03.04 | Owner kernel: secret boundary and secret hygiene | 4 | owner |
| E03.05 | Wire and binding version axes | 4 | protocol, contract |
| E03.06 | CI boundary lint and PR budget checks: the remaining work | 4 | repo |
| E03.07 | Signed npm release pipeline | 4 | repo |
| E03.08 | Domain-separation tag constants | 4 | protocol |
| E03.10 | Effect 4 inside the SDK: bundling and the midnight-js adapter file | 4 | core, repo |
| E03.03 | Seam interface definitions | 5 | core |

## Dependencies

**Blocked by:**
- E01 Review and alignment: E01.03 Roadmap sign-off and issue filing

**Unlocks:** E04 Account deployment (6 stories), E05 Contract binding (2 stories), E09 Scoped grants foundation (4 stories), E17 Private data and backup (1 story), E19 Devices and multi-device sync (1 story), E21 Guardian recovery (1 story), E25 Cross-chain assets (1 story).

**Parallel with:** E02 Passport app: brand and identity, E06 Passport app: onboarding.

## Exit criteria

- All six packages build, test, and publish a pre-release from CI.
- A test import of `owner` from `connect` or `agent` fails CI.
- The seam interfaces compile and have stub implementations for local development.
- A release is signed and reproducible from a clean checkout.

## Verification plan

- The dependency-rules tests and the boundary lint run on every PR.
- A deliberate boundary violation and an unpinned dependency are both rejected by CI.
