# E07 · Payments

**Issue:** [#50](https://github.com/midnightntwrk/midnight-passport-sdk/issues/50)  
**Milestone:** 2 Account management and core actions · **Track:** SDK, owner and foundation · **Steps:** 8–10 · **Stories:** 2  
**Packages:** `core`, `owner`  
**Sheet code:** E6  
**Readiness:** ready, no story marked to discuss

## Goal

The owner can receive and send money from their Passport: incoming payments arrive safely, and outgoing payments go to a name or an address through deposit calls.

## Description

Once the account exists, the first thing an owner does with it is move money. This epic gives `core` the payment primitives, and `owner` the owner-signed flows on top. It was originally "Devices, names, and payments"; names moved to E04 so onboarding can claim one, devices moved to E14 so a new device can sync in the same milestone, and the WaaS backup key moved to E13 because it carries WPP ciphertext.

**Coins and the inbox.** The coin store in `core` tracks the account's coins. Payments to the account arrive encrypted in the account's inbox: each one is sealed to the recipient key that was current at the time of the seal (rule 7), and the SDK opens them from the inbox and adds them to the coin store.

**Paying out.** A transfer uses the full shielded address, with both halves parsed from one address (rule 6). Paying another Passport goes through the name: `core` resolves the name to the ACC, and the payment is a deposit call on that ACC, never a raw transfer to its address (rule 3). After the transaction finalizes with `SucceedEntirely`, the SDK writes the result back to local state (rule 8). Fees are sponsored, as everywhere else (rule 14).

**Why deposits.** The ACC is a contract, not a wallet address. Sending coins straight to its address would bypass the contract's accounting, so the SDK and every UI only ever offer a deposit flow for receiving, and never show the raw ACC address as a payment address.

## Scope

**In:** the coin store, the encrypted inbox, and transfers through deposit calls to a name or an address.

**Out:** device management (E14), the WaaS backup key (E13), names (E04), payments from dApps (Pay with Passport, E21), and cross-chain assets (E24).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E07.01 | Coin store and encrypted inbox | 8 | core |
| E07.02 | Transfers via deposit calls | 10 | core, owner |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.11 Multi-wave ACC deploy planner, E04.16 Name-to-ACC resolution

**Unlocks:** E08 Passport app: the account (2 stories), E21 Execution under a grant key (1 story), E24 Cross-chain assets (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- On devnet, a payment sent to a user's name arrives in their inbox and shows in the coin store.
- The owner sends shielded and unshielded payments to a name and to an address.
- No code path or UI exposes the raw ACC address as a payment address.
- The write-back happens only after `SucceedEntirely`, and is retried when it fails.

## Verification plan

- Unit tests for address parsing (both halves), inbox sealing, and opening.
- A devnet test of a payment between two Passports by name.
- A test that a failed write-back is kept locally and retried.
