# E14 · Devices and multi-device sync

**Issue:** [#57](https://github.com/midnightntwrk/midnight-passport-sdk/issues/57)  
**Milestone:** 4 Private data and sync · **Track:** SDK, owner and foundation · **Steps:** 5–12 · **Stories:** 7  
**Packages:** `protocol`, `owner`, `core`  
**Sheet code:** E18  
**Readiness:** 1 story to discuss: "Owner key add and remove on the ACC"

## Goal

The owner can add and remove devices, and every device on the account shows the same account, balances, and private history.

## Description

A Passport should work the same on a phone and a laptop. That needs two things: a way to add a device as an owner, and a way to give it the keys and state it needs to work straight away. Both are in this epic, so a new device is never added without being able to sync. Device add moved here from E07 for that reason.

**Adding a device.** A new device shows an enrollment request as a QR code or a link: its public key, the account it wants to join, a short expiry, and a signature that proves it holds the key. An existing device checks the request, the user approves with a tap, and `owner` adds the new owner key to the ACC. Removing a lost device revokes its key on chain. An existing wallet can also be added as an owner key on a k256 arm.

**The open question.** The architecture is moving toward synced passkeys, where the same passkey, and so the same owner key, is used on every device through the passkey provider. In that model, adding a device may need no ACC call at all, only the bootstrap below. Per-device owner keys stay possible for device-bound passkeys and wallets. This decision is marked on "Owner key add and remove on the ACC".

**Bootstrap and sync.** A new device receives the viewing key, sealed to its key, and the private state it needs. From then on, private records and history stay in sync across devices through WPP, with ciphertext only, and conflicts resolved per entry with the integrity checks in `core`. Every rotation of the viewing key re-seals it for every device.

## Scope

**In:** the enrollment request, owner-key add and remove, wallets as owner keys, viewing-key distribution, the new-device bootstrap, sync over WPP, and the two-device consistency test.

**Out:** the device screens (E15), guardian recovery when every device is lost (E16), and viewing-key rotation for read grants (E17).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E14.01 | Device enrollment request (QR or link payload) | 5 | protocol, owner |
| E14.02 | Owner key add and remove on the ACC (to discuss) | 8 | owner |
| E14.03 | k256 wallet as an owner key | 9 | core, owner |
| E14.04 | Viewing-key distribution to each device | 9 | owner |
| E14.05 | New-device bootstrap: keys and state | 10 | owner, protocol |
| E14.06 | Private-state sync over WPP | 11 | owner, core |
| E14.07 | Two-device consistency test | 12 | owner |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.08 Domain-separation tag constants
- E04 Account deployment: E04.02 KeyProvider across k256, p256, and JubJub, E04.11 Multi-wave ACC deploy planner
- E13 Private data and backup: E13.01 WPP client and storage seam, E13.03 Password-wrapped WPP backup

**Unlocks:** E13 Private data and backup (1 story), E15 Passport app: backup and devices (2 stories), E16 Guardian recovery (1 story), E17 Read-access lifecycle (2 stories), E23 Identity and credentials (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A second device joins the account on devnet and shows the same balances and history.
- A removed device can no longer act as an owner.
- A change made on one device appears on the other.
- The synced-passkey decision is recorded, with an ADR if it changes the docs.

## Verification plan

- The two-device consistency test in CI.
- Unit tests for the enrollment request: signature, expiry, and account binding.
- A test that a replayed or expired request is rejected.
