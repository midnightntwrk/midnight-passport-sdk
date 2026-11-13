# E04 · Account deployment

**Issue:** [#47](https://github.com/midnightntwrk/midnight-passport-sdk/issues/47)  
**Milestone:** 1 Foundation · **Track:** SDK, owner and foundation · **Steps:** 1–11 · **Stories:** 21  
**Packages:** `core`, `adapter-broadcast`, `adapter-prover-remote`, `adapter-browser`, `adapter-nodejs`, `adapter-waas`, `owner`, `contract`, `adapter-indexer` (proposed)  
**Sheet code:** E16  
**Readiness:** 2 stories to discuss: "Add circuits to a live account" and "Recovery via the WaaS backup owner key"

## Goal

The SDK deploys a user's Account Custody Contract (ACC) with the device passkey as the first owner key, and a sponsor pays the fees. The account then gains the circuits a dApp's grant needs, and the user can add a WaaS backup owner key to recover with. Every later epic needs a live account, so this is the first end-to-end milestone.

## Description

Everything in Midnight Passport starts from the user's Account Custody Contract (ACC): the on-chain contract that holds the account's owner keys, its grants, and its funds. This epic builds the path from "a person with a phone" to "a live ACC on chain", with no seed phrase and no tokens of their own. It is the first epic that touches the chain end to end, so it also delivers the plumbing every later epic reuses: the key providers, the remote prover, the broadcast adapter, the platform adapters, and the indexer seam.

**The account secrets come first.** Without a passkey-derived secret, each other input of the account needs its own source: the maintenance authority key, the deploy nonce, the viewing key, the birth recovery key and wrap, and the private-state encryption key. Several of them fix the account address, so a spec and an ADR settle them, with a spike on a local node, before the deploy is written.

**The flow.** The Passport app calls `owner` to create a WebAuthn passkey. The private key never leaves the authenticator: the ACC verifies the passkey's own signature on the p256 arm, so each owner call is one prompt and one remote proof. `owner` then plans the deploy. An account is born with the p256 arm only, about 20 of the 52 circuits, so the verifier keys still go out in waves: one deploy transaction, then maintenance updates. Each wave is proven by the remote prover and paid by the sponsor through `adapter-broadcast`, which submits it, follows it, and resubmits it if needed. The planner is resumable, and `contract` binds to an account that has only some circuits on chain, with a typed error when a call needs one that is missing. The user activates the account with the passkey, and the sponsor adds a small starting balance.

**Circuits after birth.** A dApp's grant key is a software JubJub key, so its calls need no prompt, but the circuits that verify it are not in the first deploy. A maintenance update installs them, signed by the maintenance authority, as part of account creation. The same path later adds a whole k256 or JubJub arm.

**Coming back.** On a later visit on the same device, `owner` reads the local account record and confirms the account on chain through the indexer seam, so a returning user never deploys a second account. Finding the account from a wiped or new device needs a design decision first.

**Names.** `owner` registers the user's name, and `core` resolves a name back to the ACC. The ACC has no name circuit yet, so a design note on how the account owns a name comes first.

**Key concepts.** A *signing arm* is one of the signature schemes the ACC verifies (k256, p256, and JubJub). The `KeyProvider` interface in `core` hides the arm from callers, but each arm builds its own exact digest. A *wave* is one deploy or maintenance transaction carrying a subset of the ACC's circuits. A *seam* is an interface in `core` that an adapter implements, so the prover, broadcast, platform, and indexer can be swapped without touching the libraries.

**Design choices.** Proving is remote in V1, because ACC proving keys are 112–224 MB. The user is told that the prover sees the private inputs of each proof (rule 2), and `owner` exposes the disclosure text and a consent hook for the app. Fees are always sponsored: no SDK path needs DUST that the user holds (rule 14). The sponsor's limits are a written policy, and each refusal is a typed error rather than a generic failure.

**Boundaries.** The passkey's private key never leaves the authenticator, and the account's other secrets exist only inside the owner kernel. Owner keys are created only in the Passport app, never in a dApp (rule 11).

**The WaaS backup key.** An optional backup owner key held by a WaaS provider, and only when the provider isolates it to the Passport app (rule 12). `adapter-waas` holds the key and the account's public metadata: namespaced, versioned entries, each small enough for providers that keep only 2 KB. The k256 arm is not in the first deploy, so the key is enrolled after it is installed. It gives an early recovery path, long before guardians: on a new device, the WaaS key signs the add of the new passkey's owner key. Whether that add is direct or goes through the timelocked recovery with cancel and alarms is still open, and its story is marked to discuss.

**The example page.** Until the Passport app exists, a bare page in the SDK repository, built only on the public API of `owner`, lets a person create an account and later approve a dApp's grant. It is the end-to-end test of this epic, and what beta users open.

## Scope

**In:** the account secrets spec and ADR, the passkey on the p256 arm, the deploy in waves with activation, adding circuits to a live account, the partial-deploy checks, the sponsor policy and starting balance, the prover and broadcast adapters, the platform adapters, the indexer seam, the existing-account lookup, the prover disclosure hook, name registration and resolution, the WaaS adapter, backup owner key, and recovery with it, and the example page.

**Out:** the onboarding screens (E06), adding devices (E19), grant keys (E10), payments (E07), the in-browser prover (E15, after V1), guardian recovery (E21), and the Capacity Exchange fee route (later).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E04.01 | Sponsor policy and typed refusals | 1 | core |
| E04.20 | Account secrets and deploy inputs without a passkey-derived secret (spec and ADR) | 1 | docs |
| E04.02 | KeyProvider across p256, k256 and JubJub | 6 | core |
| E04.03 | adapter-prover-remote | 6 | adapter-prover-remote, core |
| E04.04 | adapter-broadcast: sponsor payment, submit, follow, resubmit | 6 | adapter-broadcast, core |
| E04.05 | adapter-browser and adapter-nodejs | 6 | adapter-browser, adapter-nodejs |
| E04.06 | Indexer seam: transaction status and account state | 6 | adapter-indexer (proposed), core |
| E04.15 | Partial-deploy circuit checks | 6 | contract, core |
| E04.07 | adapter-waas: k256 key and account metadata | 7 | adapter-waas, core |
| E04.10 | Prover disclosure text and consent hook (rule 2) | 7 | owner, core |
| E04.11 | Passkey on the p256 arm as the first owner key | 7 | owner, adapter-browser, core |
| E04.12 | Account deploy in waves: plan, send, resume, activate | 8 | owner, contract |
| E04.13 | Existing-account lookup | 8 | owner |
| E04.14 | WebAuthn authenticator support matrix and fallbacks | 8 | adapter-browser |
| E04.09 | Starting balance | 9 | owner, adapter-broadcast |
| E04.16 | Name registration call | 9 | owner, protocol |
| E04.22 | Add circuits to a live account: grant-spend circuits and later arms (to discuss) | 9 | owner, contract |
| E04.17 | WaaS key as isolated backup owner key | 10 | owner, adapter-waas |
| E04.18 | Name-to-ACC resolution | 10 | core |
| E04.21 | Example page: create an account and approve a grant | 10 | examples |
| E04.19 | Recovery via the WaaS backup owner key (to discuss) | 11 | owner, adapter-waas |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.03 Seam interface definitions, E03.08 Domain-separation tag constants, E03.10 Effect 4 inside the SDK: bundling and the midnight-js adapter file
- E05 Contract binding: E05.01 ACC artifact build and publication (ADR), E05.03 ACC artifact loader (module, decoder, manifest)
- E10 Scoped grants ceremony: E10.02 Authorizer page (MIP §9), E10.03 issue_grant call

**Unlocks:** E05 Contract binding (1 story), E06 Passport app: onboarding (3 stories), E07 Payments (6 stories), E08 Passport app: the account (2 stories), E10 Scoped grants ceremony (1 story), E11 Grant ceremony clients (1 story), E13 Connect for dApps (1 story), E15 Execution under a grant key (2 stories), E17 Private data and backup (1 story), E19 Devices and multi-device sync (2 stories), E24 Identity and credentials (1 story).

**Parallel with:** E02 Passport app: brand and identity.

## Exit criteria

- On devnet, a new user creates a passkey and the ACC deploys across all waves on the p256 arm, with the sponsor paying all fees.
- The account gains the grant-spend circuits by a maintenance update, without a second visit.
- The user receives the starting balance and holds no DUST of their own (rule 14).
- A name is registered, and `core` resolves it back to the ACC.
- The same user returning on the same device lands on the existing account.
- Each sponsor refusal surfaces as a typed error.
- A user with an isolated WaaS backup owner key gets back into the same account on a fresh device.
- The example page creates an account and approves a grant, in CI with a virtual authenticator.

## Verification plan

- Unit tests per seam, and per signing arm with the exact digest.
- Integration against a local proof server and devnet: real deploys, real proofs, real broadcasts.
- The authenticator support matrix is run on real authenticators, not mocks.
- A failed wave is resumed in a test without redeploying earlier waves.
- The chosen maintenance-authority design adds circuits to a p256-only account on a local node.
