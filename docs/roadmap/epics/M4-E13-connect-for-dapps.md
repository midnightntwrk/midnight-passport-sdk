# E13 · Connect for dApps

**Issue:** [#62](https://github.com/midnightntwrk/midnight-passport-sdk/issues/62)  
**Milestone:** 4 Integrations · **Track:** SDK, shared client and integrations · **Steps:** 9–12 · **Stories:** 4  
**Packages:** `connect`, `owner`  
**Sheet code:** E10  
**Readiness:** ready, no story marked to discuss

## Goal

Give dApp developers the `connect` library: sign users in, send new users to Passport, and start from a template.

## Description

`mn-passport-connect` is what a dApp developer installs. By this milestone, its hardest part already exists: the grant ceremony (E11, milestone 3). This epic completes the library around it, so partners can integrate early. Calls and payments under the grant key follow in E15 (milestone 5), and private data in E18 (milestone 6).

**Sign-in.** A dApp verifies the sign-in message (E09) to know who the user is, by account and name, without asking for a grant.

**New users.** A dApp never creates accounts and never adds an owner key (rule 11). When a user has no Passport, `connect` sends them to the Passport app, which onboards them and issues the dApp's grant in the same visit, then returns them to the dApp.

**Private state.** Until E18, a dApp keeps its private state the way it does today. A dApp that prefers to keep its own private state can, but then it gets no backup, sync, or recovery from Passport.

**Getting started.** A project template wires `connect` with the browser adapter, the remote prover, and the broadcast adapter. Onboarding measurements count each step of the new-user redirect, without collecting personal data, so drop-offs can be fixed.

`connect` never links `owner` (rule 4).

## Scope

**In:** sign-in verification, the new-user redirect, the project template, and onboarding measurements.

**Out:** the grant ceremony (E11), calls and Pay with Passport (E15), the reference dApp (E15), the handoff and the private-state provider (E18), and read-grant revocation handling (E22).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E13.01 | connect project template | 9 | connect |
| E13.02 | connect: sign-in verification | 10 | connect |
| E13.03 | connect: new-user redirect to onboarding | 11 | connect, owner |
| E13.04 | Onboarding funnel instrumentation | 12 | connect |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.18 Name-to-ACC resolution
- E06 Passport app: onboarding: E06.01 Onboarding flow: passkey creation
- E09 Scoped grants foundation: E09.03 Sign-in message (MIP §10)
- E11 Grant ceremony clients: E11.03 connect: browser grant ceremony

**Unlocks:** E15 Execution under a grant key (1 story).

**Parallel with:** E14 Agents.

## Exit criteria

- A dApp built from the template signs a user in, sends a new user through Passport onboarding, and gets them back with a grant.
- The boundary lint confirms `connect` does not link `owner`.

## Verification plan

- End-to-end tests with the test dApp on devnet.
- A fresh project from the template passes its own smoke test.
