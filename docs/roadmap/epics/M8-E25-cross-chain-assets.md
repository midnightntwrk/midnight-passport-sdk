# E25 · Cross-chain assets

**Issue:** [#67](https://github.com/midnightntwrk/midnight-passport-sdk/issues/67)  
**Milestone:** 8 Use Cases · **Track:** Use cases · **Steps:** 5–10 · **Stories:** 4  
**Packages:** `core`, `adapter-multi-chain`  
**Sheet code:** E17  
**Readiness:** ready, no story marked to discuss

## Goal

Users bring ETH or BTC into a Midnight app and use it there, without a second wallet.

## Description

Many users hold assets on other chains. This epic lets a Passport use them inside Midnight apps, through a multi-chain signature network that signs on other chains for the ACC.

**The interface.** The SDK agrees an interface with the signature network. The network signs for the ACC on another chain only after the ACC authorizes the intent. `adapter-multi-chain` implements the multi-chain seam in `core`.

**Using the assets.** A deposit on the other chain becomes a balance the account can use. The user can then swap those assets or spend them inside a Midnight dApp, with the intent joiner settling the payment together with the dApp's action.

## Scope

**In:** the signature network interface, the multi-chain adapter, deposits from ETH and BTC, and swap or spend through the joiner.

**Out:** Passport in the wallet pickers of other chains (`mn-passport-ecosystems`).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E25.01 | Multi-chain signature network interface | 5 | core, adapter-multi-chain |
| E25.02 | adapter-multi-chain | 6 | adapter-multi-chain |
| E25.03 | ETH and BTC deposit flow | 9 | core |
| E25.04 | Cross-chain swap or spend via joiner | 10 | core |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.03 Seam interface definitions
- E07 Payments: E07.01 Inbox entries, the coin store, and deposits into an account
- E15 Execution under a grant key: E15.01 Intent joiner: dApp intent + ACC payment

**Unlocks:** no other epic waits on it.

**Parallel with:** E24 Identity and credentials.

## Exit criteria

- On a test network, a user deposits ETH and spends it in a Midnight dApp from their Passport.

## Verification plan

- Integration tests against the signature network's test environment.
