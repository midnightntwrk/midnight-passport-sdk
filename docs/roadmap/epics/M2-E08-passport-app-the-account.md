# E08 · Passport app: the account

**Issue:** [#51](https://github.com/midnightntwrk/midnight-passport-sdk/issues/51)  
**Milestone:** 2 Account management and core actions · **Track:** Passport app · **Steps:** 9–11 · **Stories:** 3  
**Packages:** none (Passport app or process work)  
**Sheet code:** 5P  
**Readiness:** ready, no story marked to discuss

## Goal

Give the owner the everyday account screens: claiming or changing a name, sending and receiving payments, and seeing what happened on the account.

## Description

After onboarding, the owner needs a home in the app. This epic builds it on top of E07 Payments and the name stories in E04, with the components from E02.

**Name.** A user who skipped the name step during onboarding claims one here, with an availability check as they type. This screen overlaps with the onboarding name step, and it may become "Change or add a name".

**Send and receive.** The owner pays someone by name or by full shielded address, and sees the fee covered by the sponsor. Receiving shows a deposit flow, never the raw account address (rule 3).

**Activity.** One timeline of what happened on the account: the deploy waves, payments in and out, and later grants and device changes. It is built from the indexer seam and the inbox.

## Scope

**In:** the name claim screen, the send and deposit screens, and the activity feed.

**Out:** the devices screen (E15), grants (E12), and backup and recovery screens (E15, E18).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E08.01 | Name claim screen | 9 | app |
| E08.02 | Activity feed (indexer and inbox) | 9 | app |
| E08.03 | Transfer and deposit screens | 11 | app |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.06 Indexer seam: tx status and ACC state, E04.15 Name registration call
- E07 Payments: E07.01 Coin store and encrypted inbox, E07.02 Transfers via deposit calls

**Unlocks:** no other epic waits on it.

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A user claims a name from the account screen after skipping it during onboarding.
- A user sends a payment to a name and sees it in the activity feed.
- The receive screen never shows a raw ACC address.

## Verification plan

- End-to-end UI tests on devnet for name claim, send, and receive.
- A check that the activity feed matches the indexer after a series of payments.
