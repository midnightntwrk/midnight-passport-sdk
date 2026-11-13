# E20 · Passport app: backup and devices

**Issue:** [#58](https://github.com/midnightntwrk/midnight-passport-sdk/issues/58)  
**Milestone:** 6 Private data and sync · **Track:** Passport app · **Steps:** 8–11 · **Stories:** 3  
**Packages:** none (Passport app or process work)  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Give the owner the screens to manage devices, back up and restore private data, and add a device.

## Description

This is the app side of milestone 6. It brings the devices screen, the backup screens, and the device join flow together, because a user thinks of them as one thing: "my account on all my devices, and safe if I lose one".

**Devices.** All devices on the account, when each was added, and on which signing arm. Removing a device needs a tap on another device.

**Backup and restore.** Set up the backup, see whether it is current, stale, or missing, and restore it on a new device.

**Add a device.** Scan a code on the new device, approve on the old one, and see the same account appear.

## Scope

**In:** the devices screen, the backup and restore screens, and the device join and sync screens.

**Out:** the SDK logic (E17, E19), the private-data handoff test (E18), and the guardian recovery screens (E23).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E20.01 | Backup and restore screens | 8 | app |
| E20.02 | Devices screen (owner key list) | 9 | app |
| E20.03 | Device join and sync screens | 11 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.01 App design: UX flow, pages, and design foundations
- E17 Private data and backup: E17.05 WPP restore on a new device, E17.06 Backup freshness state
- E19 Devices and multi-device sync: E19.02 Owner key add and remove on the ACC, E19.05 New-device bootstrap: keys and state

**Unlocks:** no other epic waits on it.

**Parallel with:** E18 Private data in connect and agent.

## Exit criteria

- A user adds a second device from the app and sees the same account.
- A user restores their private data on a new device from the backup screen.

## Verification plan

- End-to-end UI tests for device join and restore on devnet.
