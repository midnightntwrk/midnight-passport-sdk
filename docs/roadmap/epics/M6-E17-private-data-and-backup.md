# E17 · Private data and backup

**Issue:** [#56](https://github.com/midnightntwrk/midnight-passport-sdk/issues/56)  
**Milestone:** 6 Private data and sync · **Track:** SDK, owner and foundation · **Steps:** 5–8 · **Stories:** 7  
**Packages:** `core`, `adapter-wpp-drive`, `owner`  
**Sheet code:** E8  
**Readiness:** 1 story to discuss: "Password-wrapped WPP backup"

## Goal

The account's private data is stored encrypted in WPP, backed up, restorable on a new device, with each package key derived for one dApp or agent only.

## Description

Midnight dApps keep private state: the witness data their circuits need, which never goes on chain. If that state lives only in one browser, losing the device loses it. Passport keeps it in the Witness Protection Program (WPP), encrypted, and hands each dApp access to its own part only.

**The WPP client.** The WPP client lives in `mn-passport-core`, so the Passport app, dApps, and agents share it. It holds the package format, the encryption, and the entry integrity checks. Storage backends are separate `adapter-wpp-<backend>` packages that only ever see ciphertext; `adapter-wpp-drive` is the first.

**Keys.** Only the owner kernel holds the WPP account key and derives package keys from it, one per dApp. The WPP client of a dApp or an agent works with the one package key it was given, so it can never open another dApp's package.

**The private-state provider.** On top of the WPP client, `core` implements the midnight-js `PrivateStateProvider` over one package key. A dApp's witness code does not change: it reads and writes through the provider, and Passport is not on the path.

**The client read surface.** `owner` derives the key for one dApp's package only, and this epic defines what else a client may read. Handing that key to `connect` and to agents is E18, so the clients that integrated earlier get private data in one place.

**Backup and restore.** The private state is backed up and restored on a new or reset device, and the app shows whether the backup is current, stale, or missing. How the backup is encrypted is still open, and its story is marked to discuss.

## Scope

**In:** the WPP client and storage seam, the backup, the backup targets, restore, backup states, the client read surface and package-key derivation, and the shared private-state provider.

**Out:** multi-device sync (E19), restoring private history after recovery (E21), read grants and viewing-key rotation (E22), the WaaS backup key (E04), and the `connect` and agent handoffs and providers (E18).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E17.01 | WPP client and storage seam | 5 | core, adapter-wpp-drive |
| E17.02 | Password-wrapped WPP backup (to discuss) | 6 | owner, core |
| E17.03 | adapter-wpp-<backend> targets (Drive first) | 6 | adapter-wpp-drive |
| E17.04 | core: WPP PrivateStateProvider (one package key) | 6 | core |
| E17.05 | WPP restore on a new device | 7 | owner |
| E17.06 | Backup freshness state | 7 | owner |
| E17.07 | Client read surface and package-key handoff | 8 | core |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.03 Seam interface definitions, E03.04 Owner kernel secret boundary
- E04 Account deployment: E04.12 Multi-wave ACC deploy planner

**Unlocks:** E18 Private data in connect and agent (4 stories), E19 Devices and multi-device sync (2 stories), E20 Passport app: backup and devices (1 story), E21 Guardian recovery (1 story), E22 Read-access lifecycle (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A dApp's private state is written to WPP and read back through the provider, with only ciphertext in storage.
- A package key opens its own package only.
- The private state is restored on a fresh device from the backup.

## Verification plan

- Unit tests for the package format, encryption, and integrity checks.
- Unit tests that a package key cannot open another package.
- A restore test on a fresh device against `adapter-wpp-drive`.
