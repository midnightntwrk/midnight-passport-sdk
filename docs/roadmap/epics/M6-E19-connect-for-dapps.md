# E19 · Connect for dApps

**Issue:** [#62](https://github.com/midnightntwrk/midnight-passport-sdk/issues/62)  
**Milestone:** 6 Integrations · **Track:** SDK, shared client and integrations · **Steps:** 9–14 · **Stories:** 6  
**Packages:** `connect`, `owner`  
**Sheet code:** E10  
**Readiness:** ready, no story marked to discuss

## Goal

Give dApp developers the `connect` library: sign users in, send new users to Passport, inject the private-state provider, handle revocation, and start from a template.

## Description

`mn-passport-connect` is what a dApp developer installs. By this milestone, its hardest parts already exist: the grant ceremony (E11, milestone 3) and the package-key handoff (E13, milestone 4). This epic completes the library around them, so a dApp is fully connected to Passport. Calls and payments under the grant key follow in E21.

**Sign-in.** A dApp verifies the sign-in message (E09) to know who the user is, by account and name, without asking for a grant.

**New users.** A dApp never creates accounts and never adds an owner key (rule 11). When a user has no Passport, `connect` sends them to the Passport app, which onboards them and issues the dApp's grant in the same visit, then returns them to the dApp.

**Private state.** After the handoff, `connect` wraps the package key as the private-state provider from `core` and hands it to midnight-js. The dApp's witness code does not change, and Passport is not on the read or write path. A dApp that prefers to keep its own private state can, but then it gets no backup, sync, or recovery from Passport.

**Revocation.** When a user revokes a dApp's access to private data, the package key rotates (rule 13), and `connect` handles the dApp losing access on its next read.

**Getting started.** A project template wires `connect` with the browser adapter, the remote prover, and the broadcast adapter. Onboarding measurements count each step of the new-user redirect, without collecting personal data, so drop-offs can be fixed.

`connect` never links `owner` (rule 4).

## Scope

**In:** sign-in verification, the new-user redirect, injecting the private-state provider, read-grant revocation handling, the project template, and onboarding measurements.

**Out:** the grant ceremony (E11), the handoff (E13), calls and Pay with Passport (E21), and the reference dApp (E21).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E19.01 | connect project template | 9 | connect |
| E19.02 | connect: sign-in verification | 10 | connect |
| E19.03 | connect: inject the PrivateStateProvider | 10 | connect |
| E19.04 | connect: new-user redirect to onboarding | 11 | connect, owner |
| E19.05 | Onboarding funnel instrumentation | 12 | connect |
| E19.06 | connect: read-grant revocation handling | 14 | connect, owner |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.16 Name-to-ACC resolution
- E06 Passport app: onboarding: E06.01 Onboarding flow: passkey creation
- E09 Scoped grants foundation: E09.03 Sign-in message (MIP §10)
- E10 Scoped grants ceremony: E10.05 Grant revocation call
- E11 Grant ceremony clients: E11.03 connect: browser grant ceremony
- E13 Private data and backup: E13.05 core: WPP PrivateStateProvider (one package key), E13.09 connect: package-key handoff
- E17 Read-access lifecycle: E17.01 Viewing-key rotation on revocation

**Unlocks:** E21 Execution under a grant key (1 story).

**Parallel with:** E20 Agents.

## Exit criteria

- A dApp built from the template signs a user in, sends a new user through Passport onboarding, and gets them back with a grant.
- The dApp reads and writes its private state through the injected provider.
- After a read-grant revocation, the dApp loses access on its next read.
- The boundary lint confirms `connect` does not link `owner`.

## Verification plan

- End-to-end tests with the test dApp on devnet.
- A fresh project from the template passes its own smoke test.
