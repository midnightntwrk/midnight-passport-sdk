# E18 · Private data in connect and agent

**Issue:** [#69](https://github.com/midnightntwrk/midnight-passport-sdk/issues/69)  
**Milestone:** 6 Private data and sync · **Track:** SDK, shared client and integrations · **Steps:** 9–13 · **Stories:** 6  
**Packages:** `connect`, `owner`, `agent`, `protocol`, `core`  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Bring the private data to the dApps and agents that integrated earlier: each receives its own package key, and its witnesses read and write private state through the provider from `core`.

## Description

Partners integrate in milestones 4 and 5 without private data, so they can ship sooner. Once WPP and the backup exist (E17), this epic adds private data to those clients in one place, instead of spreading it across the integration epics. It is new and not in the sheet.

**The handoff.** After the grant, the user gives a separate consent for private-state access, and the handoff completes with a passkey tap (rule 1). `owner` derives the key for that client's package only (E17). A dApp receives it in the `connect` connection flow. An agent has no redirect, so Passport seals the key to an encryption key bound by the agent's self-signature and returns it with the readable scope (ADR 0008). This bumps `PROTOCOL_VERSION`.

**The provider.** `connect` and `mn-passport-agent` wrap their package key as the private-state provider from `core` and hand it to midnight-js. The witness code does not change, and Passport is not on the read or write path. A dApp and its agent can write to the same package; how WPP handles two writers is still open.

**Reference and tests.** The reference dApp from E15 gains the handoff and private state, so it again covers every `connect` feature. An end-to-end test checks that the test dApp and test agent each open only their own package, that the agent's key arrives sealed, and that revoking private-state access rotates the package key.

`connect` and `mn-passport-agent` never link `owner` (rule 4).

## Scope

**In:** the `connect` package-key handoff, the agent's sealed handoff, injecting the private-state provider in `connect` and the agent, the reference dApp with private state, and the handoff end-to-end test.

**Out:** the WPP client, the provider in `core`, and the package-key derivation (E17), and read-grant revocation handling (E22).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E18.01 | connect: package-key handoff | 9 | connect, owner |
| E18.02 | agent: sealed package-key handoff | 9 | agent, owner, protocol |
| E18.03 | connect: inject the PrivateStateProvider | 10 | connect |
| E18.04 | agent: inject the PrivateStateProvider | 10 | agent, core |
| E18.05 | E2E: private-data handoff with the test dApp and agent | 10 | app, connect, agent |
| E18.06 | Reference dApp: private state | 13 | connect, core |

## Dependencies

**Blocked by:**
- E11 Grant ceremony clients: E11.02 agent: agent-profile grant ceremony, E11.03 connect: browser grant ceremony
- E12 Passport app: grants: E12.01 Authorizer screens (browser and agent profiles)
- E15 Execution under a grant key: E15.07 Reference dApp
- E17 Private data and backup: E17.04 core: WPP PrivateStateProvider (one package key), E17.07 Client read surface and package-key handoff

**Unlocks:** E22 Read-access lifecycle (1 story).

**Parallel with:** E19 Devices and multi-device sync, E20 Passport app: backup and devices.

## Exit criteria

- A test dApp receives its package key after the separate consent and the tap, and opens only its own package.
- A test agent receives its package key sealed, and only it can open it.
- The reference dApp reads and writes its private state through the injected provider.
- The handoff end-to-end test passes in CI.

## Verification plan

- The handoff end-to-end test with the test dApp and the test agent on devnet.
- A test that a client cannot open another client's package.
