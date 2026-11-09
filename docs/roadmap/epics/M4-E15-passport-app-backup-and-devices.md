# E15 · Passport app: backup and devices

**Issue:** [#58](https://github.com/midnightntwrk/midnight-passport-sdk/issues/58)  
**Milestone:** 4 Private data and sync · **Track:** Passport app · **Steps:** 8–11 · **Stories:** 4  
**Packages:** `connect`, `agent`  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Give the owner the screens to manage devices, back up and restore private data, add a device, and confirm that a dApp or an agent gets only its own private data.

## Description

This is the app side of milestone 4. It brings the devices screen, the backup screens, and the device join flow together, because a user thinks of them as one thing: "my account on all my devices, and safe if I lose one".

**Devices.** All devices on the account, when each was added, and on which signing arm. Removing a device needs a tap on another device.

**Backup and restore.** Set up the backup, see whether it is current, stale, or missing, and restore it on a new device.

**Add a device.** Scan a code on the new device, approve on the old one, and see the same account appear.

**Handoff test.** The test dApp and test agent from milestone 3 receive their package keys after the separate private-state consent. The test checks that each opens only its own package, that the agent's key arrives sealed, and that revoking private-state access rotates the package key.

## Scope

**In:** the devices screen, the backup and restore screens, the device join and sync screens, and the private-data handoff end-to-end test.

**Out:** the SDK logic (E13, E14), and the guardian recovery screens (E18).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E15.01 | Backup and restore screens | 8 | app |
| E15.02 | Devices screen (owner key list) | 9 | app |
| E15.03 | E2E: private-data handoff with the test dApp and agent | 10 | app, connect, agent |
| E15.04 | Device join and sync screens | 11 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.02 UI component library and interaction patterns
- E12 Passport app: grants: E12.01 Authorizer screens (browser and agent profiles)
- E13 Private data and backup: E13.06 WPP restore on a new device, E13.07 Backup freshness state, E13.09 connect: package-key handoff, E13.10 agent: sealed package-key handoff
- E14 Devices and multi-device sync: E14.02 Owner key add and remove on the ACC, E14.05 New-device bootstrap: keys and state

**Unlocks:** no other epic waits on it.

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A user adds a second device from the app and sees the same account.
- A user restores their private data on a new device from the backup screen.
- The handoff end-to-end test passes in CI.

## Verification plan

- End-to-end UI tests for device join and restore on devnet.
- The handoff end-to-end test.
