# E04 · Account deployment

**Issue:** [#47](https://github.com/midnightntwrk/midnight-passport-sdk/issues/47)  
**Milestone:** 1 Foundation · **Track:** SDK, owner and foundation · **Steps:** 1–9 · **Stories:** 16  
**Packages:** `core`, `adapter-broadcast`, `adapter-prover-remote`, `adapter-browser`, `adapter-nodejs`, `owner`, `contract`  
**Sheet code:** E16  
**Readiness:** ready, no story marked to discuss

## Goal

The SDK deploys a user's Account Custody Contract (ACC) with the device passkey as the first owner key, and a sponsor pays the fees. The user ends with a named account. Every later epic needs a live account, so this is the first end-to-end milestone.

## Description

Everything in Midnight Passport starts from the user's Account Custody Contract (ACC): the on-chain contract that holds the account's owner keys, its grants, and its funds. This epic builds the path from "a person with a phone" to "a live, named ACC on chain", with no seed phrase and no tokens of their own. It is the first epic that touches the chain end to end, so it also delivers the plumbing every later epic reuses: the key providers, the remote prover, the broadcast adapter, the platform adapters, and the indexer seam.

**The flow.** The Passport app calls `owner` to create a WebAuthn passkey with the PRF extension. The authenticator returns a per-credential secret, and the owner kernel derives a JubJub device key from it. That key becomes the first owner key of the new ACC. If the authenticator has no PRF, the passkey joins on the p256 arm instead: the ACC verifies the authenticator's own signature, and the key never leaves the device. `owner` then plans the deploy. The ACC is too large for one transaction, so the planner packs its circuits into several waves that each fit the verifier key budget, using the artifact that `contract` loads. Each wave is sent as an unproven transaction to the remote prover, which returns it proven, and then to the sponsor through `adapter-broadcast`, which pays the fees, broadcasts, and follows the transaction until it is final. The planner is resumable: a failed wave is retried without redeploying the earlier ones, and the SDK can already use an account whose later waves are still pending, as long as a call only needs deployed circuits. Once the account is live, the sponsor adds a small starting balance, and `owner` registers the user's name, which `core` can resolve back to the ACC.

**Coming back.** On a later visit, `owner` finds the existing account from the passkey and local state, and confirms it on chain through the indexer seam, so a returning user never deploys a second account.

**Key concepts.** A *signing arm* is one of the four signature schemes the ACC verifies (k256 envelope 0, k256 envelope 1, p256, and JubJub). The `KeyProvider` interface in `core` hides the arm from callers, but each arm builds its own exact digest. A *wave* is one deploy transaction carrying a subset of the ACC's circuits. A *seam* is an interface in `core` that an adapter implements, so the prover, broadcast, platform, and indexer can be swapped without touching the libraries.

**Design choices.** Proving is remote in V1, because ACC proving keys are 112–224 MB. The user is told that the prover sees the private inputs of each proof (rule 2), and `owner` exposes the disclosure text and a consent hook for the app. Fees are always sponsored: no SDK path needs DUST that the user holds (rule 14). The sponsor's limits are a written policy, and each refusal is a typed error rather than a generic failure.

**Boundaries.** The PRF output and the JubJub device key exist only inside the owner kernel, and only for one operation; they are never stored or sent. Owner keys are created only in the Passport app, never in a dApp (rule 11). This epic adds the first owner key only; adding and removing further devices is E14.

## Scope

**In:** passkey creation (PRF → JubJub, with the p256 fallback), the multi-wave deploy, the sponsored start, the prover and broadcast adapters, the platform adapters, the indexer seam, the existing-account lookup, the prover disclosure hook, and name registration and resolution.

**Out:** the onboarding screens (E06), adding devices (E14), grant keys (E10), payments (E07), the in-browser prover (E21, after V1), and the Capacity Exchange fee route (later).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E04.01 | Sponsor policy and typed refusals | 1 | core, adapter-broadcast |
| E04.02 | KeyProvider across k256, p256, and JubJub | 5 | core |
| E04.03 | adapter-prover-remote | 5 | core, adapter-prover-remote |
| E04.04 | adapter-broadcast: submit, finality, resubmit | 5 | core, adapter-broadcast |
| E04.05 | adapter-browser and adapter-nodejs | 5 | adapter-browser, adapter-nodejs |
| E04.06 | Indexer seam: tx status and ACC state | 5 | core |
| E04.07 | WebAuthn create with PRF → JubJub device key | 6 | owner, adapter-browser |
| E04.08 | Sponsored deploy and starting balance | 6 | owner, adapter-broadcast |
| E04.09 | Prover disclosure text and consent hook (rule 2) | 6 | owner |
| E04.10 | p256 arm: non-PRF passkeys as owner keys | 6 | core, adapter-browser |
| E04.11 | Multi-wave ACC deploy planner | 7 | owner, contract |
| E04.12 | Existing-account lookup by passkey | 7 | owner |
| E04.13 | WebAuthn PRF support matrix and fallbacks | 7 | adapter-browser |
| E04.14 | Partial-deploy circuit checks | 8 | owner, core |
| E04.15 | Name registration call | 8 | owner |
| E04.16 | Name-to-ACC resolution | 9 | core |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.03 Seam interface definitions, E03.04 Owner kernel secret boundary, E03.08 Domain-separation tag constants
- E05 Contract binding: E05.03 ACC artifact loader (module, decoder, manifest)

**Unlocks:** E06 Passport app: onboarding (4 stories), E07 Payments (2 stories), E08 Passport app: the account (2 stories), E10 Scoped grants ceremony (1 story), E11 Grant ceremony clients (1 story), E13 Private data and backup (1 story), E14 Devices and multi-device sync (2 stories), E19 Connect for dApps (1 story), E21 Execution under a grant key (2 stories), E23 Identity and credentials (1 story).

**Parallel with:** E02 Passport app: brand and identity.

## Exit criteria

- On devnet, from a PRF-capable browser, a new user creates a passkey and the ACC deploys across all waves, with the sponsor paying all fees.
- The user receives the starting balance and holds no DUST of their own (rule 14).
- A name is registered, and `core` resolves it back to the ACC.
- The same user returning on the same device lands on the existing account.
- A device without PRF completes the same flow on the p256 arm.
- Each sponsor refusal surfaces as a typed error.

## Verification plan

- Unit tests per seam, and per signing arm with the exact digest.
- Integration against a local proof server and devnet: real deploys, real proofs, real broadcasts.
- The PRF support matrix is run on real authenticators, not mocks.
- A failed wave is resumed in a test without redeploying earlier waves.
