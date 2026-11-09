# E12 · Passport app: grants

**Issue:** [#55](https://github.com/midnightntwrk/midnight-passport-sdk/issues/55)  
**Milestone:** 3 Control · **Track:** Passport app · **Steps:** 9–11 · **Stories:** 5  
**Packages:** none (Passport app or process work)  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Give the owner the screens to approve dApps and agents, see every grant, revoke any of them, and manage child Passports, proven end to end with a test dApp and a test agent.

## Description

This is the Passport app half of the grant ceremony in milestone 3. It was split out of the old "Passport app: control" epic so the grant work is not blocked by backup or recovery screens.

**Authorizer screens.** One authorizer page with two profiles. For a dApp, it shows the origin; for an agent, the label and the expiry. Both show the scope in plain language and end in one passkey tap. When private-data access is requested later (E13), that consent is a separate step after the grant consent.

**Grant list and revoke.** Every grant the account has given, read from the chain, with its scope and expiry, and a one-tap revoke.

**Child Passports.** Create a child Passport for an agent or a family member, and revoke it.

**End-to-end tests.** A minimal test dApp and a minimal test agent run the whole ceremony against the real app on devnet in CI. They become the base for the handoff test in milestone 4 and the full suite in milestone 7.

## Scope

**In:** the authorizer screens for both profiles, the grant list and revoke screen, the child Passport screens, and the two end-to-end ceremony tests.

**Out:** the SDK logic (E10, E11), and the private-data consent screens (E15).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E12.01 | Authorizer screens (browser and agent profiles) | 9 | app |
| E12.02 | E2E: dApp grant ceremony with a test dApp | 10 | app |
| E12.03 | E2E: agent grant ceremony with a test agent | 10 | app |
| E12.04 | Grant list and revoke screen | 11 | app |
| E12.05 | Child Passport screens | 11 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.02 UI component library and interaction patterns
- E10 Scoped grants ceremony: E10.02 Authorizer page (MIP §9), E10.03 issue_grant call, E10.05 Grant revocation call, E10.07 Grant listing from chain, E10.08 Child Passport: subdomain name and grant
- E11 Grant ceremony clients: E11.02 agent: agent-profile grant ceremony, E11.03 connect: browser grant ceremony

**Unlocks:** E15 Passport app: backup and devices (1 story), E22 Integration hardening (1 story).

**Parallel with:** E09 Scoped grants foundation.

## Exit criteria

- A user approves a test dApp and a test agent on devnet, with one tap each.
- The grant list matches the chain, and revoke works from it.
- Both end-to-end ceremony tests run in CI.

## Verification plan

- The end-to-end ceremony tests.
- A copy review of the scope wording against the E02 guidelines.
