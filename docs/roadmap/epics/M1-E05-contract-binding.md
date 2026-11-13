# E05 · Contract binding

**Issue:** [#48](https://github.com/midnightntwrk/midnight-passport-sdk/issues/48)  
**Milestone:** 1 Foundation · **Track:** SDK, owner and foundation · **Steps:** 1–7 · **Stories:** 5  
**Packages:** `contract`  
**Sheet code:** E3  
**Readiness:** ready, no story marked to discuss

## Goal

Give every part of the SDK typed, version-checked access to the published Account Custody Contract (ACC), and to the artifacts of dApps, so no epic ever calls a contract it has not verified.

## Description

The SDK never compiles or owns the ACC. The ACC is built and published as an artifact, and the SDK consumes it. That separation is only safe if the SDK checks exactly what it loads and refuses anything it does not understand. This epic is that checking layer, in `mn-passport-contract`.

**Loading the ACC.** `contract` loads the compiled contract module, its ledger decoder, and its manifest from the published artifact, and checks them against the manifest before use. Every later epic reads ACC state and builds ACC calls through these typed bindings.

**The binding version axis.** Each deployed ACC has a version. The version registry maps each version to the binding that can talk to it, and refuses unknown versions with a typed error, never a best-effort call. This is the binding axis of rule 5; the wire axis lives in `protocol` and never shares its number.

**dApp composition.** dApps compose the ACC in their own circuits, for example to take a payment and run their own logic in one transaction. The ACC's circuit interface is therefore published with the artifact and versioned with the binding.

**dApp artifacts.** Agents run the circuits of dApps, so the SDK also loads dApp artifacts. They are fetched by content hash, and the verifier key is made again from the ZKIR and the SRS and compared with the one on chain before anything runs.

**Who publishes the ACC.** One decision underpins all of this: who builds and publishes the ACC artifact, where it lives, and how its releases are versioned. It is recorded as an ADR in this epic.

## Scope

**In:** the ACC artifact loader, the binding version registry, the ACC circuit interface for dApps, the dApp artifact loader with integrity checks, and the ADR on artifact publication.

**Out:** compiling or changing the ACC itself, which is maintained upstream, and the registry service where dApps publish (requirements, open question 12).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E05.01 | ACC artifact build and publication (ADR) | 1 | contract |
| E05.02 | ACC circuit interface for dApp composition | 2 | contract |
| E05.03 | ACC artifact loader (module, decoder, manifest) | 5 | contract |
| E05.05 | dApp artifact loader with integrity checks | 6 | contract |
| E05.04 | Binding version registry | 7 | contract |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.02 Monorepo scaffold for mn-passport-* packages, E03.05 Wire and binding version axes, E03.10 Effect 4 inside the SDK: bundling and the midnight-js adapter file
- E04 Account deployment: E04.06 Indexer seam: transaction status and account state

**Unlocks:** E04 Account deployment (4 stories), E07 Payments (1 story), E15 Execution under a grant key (1 story).

**Parallel with:** E02 Passport app: brand and identity, E06 Passport app: onboarding.

## Exit criteria

- `contract` loads the published ACC artifact and rejects a tampered one.
- An ACC with an unknown version gets a typed error.
- A dApp artifact whose verifier key does not match the chain is rejected.
- The ADR on artifact build and publication is merged.

## Verification plan

- Unit tests with a valid artifact, a tampered artifact, and an unknown version.
- An integration test that loads the ACC deployed on devnet and reads its state.
