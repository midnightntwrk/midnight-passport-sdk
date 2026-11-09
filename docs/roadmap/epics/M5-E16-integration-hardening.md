# E16 · Integration hardening

**Issue:** [#65](https://github.com/midnightntwrk/midnight-passport-sdk/issues/65)  
**Milestone:** 5 Execution · **Track:** Passport app · **Steps:** 13–13 · **Stories:** 1  
**Packages:** `connect`, `agent`  
**Sheet code:** 11P  
**Readiness:** ready, no story marked to discuss

## Goal

Prove the whole system end to end in CI: the Passport app, the reference dApp, and a test agent, through every main flow.

## Description

Each milestone adds its own end-to-end tests, starting with the grant ceremony in milestone 3. This epic closes the integration milestones with the suite, run on every change, so a regression anywhere in the chain is caught before release. The private-data handoff joins it in E18.

**The suite.** It runs against devnet and a local proof server, and covers onboarding, a grant for the reference dApp and for a test agent, calls with Passport closed, a payment, and revocation. It reuses the test dApp, the test agent, and the reference dApp from earlier epics.

## Scope

**In:** the full end-to-end suite in CI.

**Out:** new features; this epic only tests what the earlier epics built.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E16.01 | E2E suite in CI | 13 | app, connect, agent |

## Dependencies

**Blocked by:**
- E12 Passport app: grants: E12.02 E2E: dApp grant ceremony with a test dApp, E12.03 E2E: agent grant ceremony with a test agent
- E15 Execution under a grant key: E15.06 agent: grant-key calls on Node.js, E15.07 Reference dApp

**Unlocks:** no other epic waits on it.

**Parallel with:** no other epic in this milestone.

## Exit criteria

- The full suite runs in CI on every change to `main`, and passes.
- A deliberately broken flow fails the suite.

## Verification plan

- The suite itself, plus a mutation check that it catches a broken grant, call, and payment.
