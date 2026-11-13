# E08 · Passport app: the account

**Issue:** [#51](https://github.com/midnightntwrk/midnight-passport-sdk/issues/51)  
**Milestone:** 2 Account management and core actions · **Track:** Passport app · **Steps:** 11–12 · **Stories:** 5  
**Packages:** none (Passport app or process work)  
**Sheet code:** 5P  
**Readiness:** 1 story to discuss: "Receive screen and deposit page"

## Goal

Give the owner the everyday account screens: the account home, claiming a name, sending and receiving payments, and seeing what happened on the account.

## Description

After onboarding, the owner needs a home in the app. This epic builds it on top of E07 Payments and the name stories in E04, with the components from E02. The screens only draw: the SDK reads in E07 do the decoding.

**Account home.** The screen a user lands on after onboarding and on every later visit: holdings per asset, payments in progress, and the entry points to send, receive, activity, and the name.

**Name.** One name claim screen, reached as the last, skippable step of onboarding and later from the account home, with an availability check as the user types.

**Send.** The owner pays an ordinary wallet address or another Passport, and sees the fee covered by the sponsor and how many passkey prompts the payment needs.

**Receive.** The user shows a link or a QR code that a payer can act on, never the raw account address (rule 3). A public deposit page lets an outside wallet that can't build a deposit call pay a Passport. It is marked to discuss.

**Activity.** One timeline of what happened on the account: its creation, payments in and out, and later grants and device changes.

## Scope

**In:** the account home, the name claim screen, the send screens, the receive screen and deposit page, and the activity feed.

**Out:** the SDK logic (E07), the devices screen (E20), grants (E12), and backup and recovery screens (E20, E23).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E08.01 | Name claim screen | 11 | app |
| E08.02 | Activity feed | 11 | app |
| E08.04 | Account home: holdings and entry points | 11 | app |
| E08.05 | Receive screen and deposit page (to discuss) | 11 | app |
| E08.03 | Send screens | 12 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.01 App design: UX flow, pages, and design foundations
- E04 Account deployment: E04.06 Indexer seam: transaction status and account state, E04.16 Name registration call, E04.18 Name-to-ACC resolution
- E06 Passport app: onboarding: E06.02 Deploy progress and balance UI, E06.03 Returning-user account resume
- E07 Payments: E07.01 Inbox entries, the coin store, and deposits into an account, E07.02 Pay another Passport: shielded, in one joined transaction, E07.03 Send from the account to a wallet address, E07.05 Holdings and activity reads

**Unlocks:** no other epic waits on it.

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A user lands on the account home after onboarding and on every later visit.
- A user claims a name from onboarding or from the account home.
- A user sends a payment to a wallet address and to another Passport, and sees it in the activity feed.
- An outside wallet pays a Passport from the deposit page.
- The receive screen never shows a raw ACC address.

## Verification plan

- End-to-end UI tests on devnet for the home, name claim, send, and receive.
- A check that the activity feed matches the chain after a series of payments.
