# E07 · Payments

**Issue:** [#50](https://github.com/midnightntwrk/midnight-passport-sdk/issues/50)  
**Milestone:** 2 Account management and core actions · **Track:** SDK, owner and foundation · **Steps:** 9–11 · **Stories:** 6  
**Packages:** `core`, `owner`  
**Sheet code:** E6  
**Readiness:** 2 stories to discuss: "Pay another Passport: shielded, in one joined transaction" and "Pay another Passport: unshielded, in two legs"

## Goal

The owner can receive and send money from their Passport: incoming payments become coins the account can spend, outgoing payments go to a wallet address or to another Passport, and the account's holdings and activity can be read.

## Description

Once the account exists, the first thing an owner does with it is move money. This epic gives `core` the payment primitives and the reads, and `owner` the owner-signed flows on top. Fees are sponsored, as everywhere else (rule 14).

**Receiving.** An account's shielded coins are held by the contract, which keeps no public description of them. Whoever deposits a coin describes it in an encrypted inbox entry, sealed to the recipient key current at the time of the seal (rule 7). `core` gets the entry codec, the builder for a deposit into an account, and a coin store that keeps each opened coin with its position in the commitment tree, which is what a spend needs.

**The coin store is a cache.** It is not in any backup. A full scan of the inbox against the chain rebuilds it from nothing, so a new device, a wiped browser, or a recovered account gets its coins back.

**Sending to a wallet.** The owner withdraws to an ordinary Midnight wallet address, using the full shielded address with both halves parsed from one address (rule 6). A shielded send spends a whole coin and returns change that only this client can describe, so the send keeps a journal to survive stopping halfway, and writes the change coin's description to the inbox.

**Paying another Passport.** The ACC is a contract, not a wallet address, so value enters it only through its deposit circuits, never a raw transfer to its address (rule 3). A shielded payment joins the payer's withdrawal and the recipient's deposit in one transaction, with the intent joiner from E15. An unshielded payment takes two legs: a withdrawal to an address of the payer's own, then a deposit into the recipient's account. Both are marked to discuss. A payee is found by name once names exist.

**Reads for the screens.** Holdings per asset and the account's activity are read in `core`, so the app screens in E08 only draw and never decode the chain.

## Scope

**In:** the inbox entry codec, the coin store and its rebuild from the chain, the deposit builder, sends to a wallet address, shielded and unshielded payments to another Passport, and the holdings and activity reads.

**Out:** the account screens (E08), names (E04), the intent joiner itself (E15), payments from dApps (Pay with Passport, E15), devices (E19), and cross-chain assets (E25).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E07.01 | Inbox entries, the coin store, and deposits into an account | 9 | core |
| E07.03 | Send from the account to a wallet address | 10 | core, owner |
| E07.05 | Holdings and activity reads | 10 | core |
| E07.02 | Pay another Passport: shielded, in one joined transaction (to discuss) | 11 | core, owner |
| E07.04 | Rebuild the coin store from the chain | 11 | core |
| E07.06 | Pay another Passport: unshielded, in two legs (to discuss) | 11 | core, owner |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.04 adapter-broadcast: sponsor payment, submit, follow, resubmit, E04.05 adapter-browser and adapter-nodejs, E04.06 Indexer seam: transaction status and account state, E04.11 Passkey on the p256 arm as the first owner key, E04.12 Account deploy in waves: plan, send, resume, activate, E04.15 Partial-deploy circuit checks, E04.18 Name-to-ACC resolution, E04.20 Account secrets and deploy inputs without a passkey-derived secret (spec and ADR)
- E05 Contract binding: E05.03 ACC artifact loader (module, decoder, manifest)
- E15 Execution under a grant key: E15.01 Intent joiner: dApp intent + ACC payment

**Unlocks:** E08 Passport app: the account (4 stories), E15 Execution under a grant key (1 story), E25 Cross-chain assets (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- On devnet, a deposit into an account adds a coin to its store that the account can spend.
- The owner sends shielded and unshielded funds to a wallet address, and a send stopped halfway completes after a restart.
- The owner pays another Passport, shielded and unshielded.
- A rebuild from the chain gives the same coin store as the live one.
- No code path or UI exposes the raw ACC address as a payment address.

## Verification plan

- Unit tests for address parsing (both halves), inbox sealing, and opening.
- Fault-injection tests that stop a send or a payment between its steps.
- Devnet tests of each payment kind between two passkey accounts.
