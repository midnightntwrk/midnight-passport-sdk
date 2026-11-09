# E13 · Private data and backup

**Issue:** [#56](https://github.com/midnightntwrk/midnight-passport-sdk/issues/56)  
**Milestone:** 4 Private data and sync · **Track:** SDK, owner and foundation · **Steps:** 5–9 · **Stories:** 11  
**Packages:** `core`, `adapter-wpp-drive`, `adapter-waas`, `owner`, `connect`, `agent`, `protocol`  
**Sheet code:** E8  
**Readiness:** 1 story to discuss: "Password-wrapped WPP backup"

## Goal

The account's private data is stored encrypted in WPP, backed up, restorable on a new device, and handed to each dApp or agent one package at a time.

## Description

Midnight dApps keep private state: the witness data their circuits need, which never goes on chain. If that state lives only in one browser, losing the device loses it. Passport keeps it in the Witness Protection Program (WPP), encrypted, and hands each dApp access to its own part only.

**The WPP client.** The WPP client lives in `mn-passport-core`, so the Passport app, dApps, and agents share it. It holds the package format, the encryption, and the entry integrity checks. Storage backends are separate `adapter-wpp-<backend>` packages that only ever see ciphertext; `adapter-wpp-drive` is the first.

**Keys.** Only the owner kernel holds the WPP account key and derives package keys from it, one per dApp. The WPP client of a dApp or an agent works with the one package key it was given, so it can never open another dApp's package.

**The private-state provider.** On top of the WPP client, `core` implements the midnight-js `PrivateStateProvider` over one package key. A dApp's witness code does not change: it reads and writes through the provider, and Passport is not on the path.

**The handoff.** After the grant, the user gives a separate consent for private-state access, and the handoff completes with a passkey tap (rule 1). `owner` derives the key for that dApp's package only. A dApp receives it in the `connect` connection flow. An agent has no redirect, so Passport seals the key to an encryption key bound by the agent's self-signature and returns it with the readable scope (ADR 0008).

**Backup and restore.** The private state is backed up and restored on a new or reset device, and the app shows whether the backup is current, stale, or missing. How the backup is encrypted is still open, and its story is marked to discuss.

**The WaaS backup key.** An optional backup owner key held by a WaaS provider, only when the provider isolates it to the Passport app (rule 12). Its metadata carries the ACC address, and the viewing key and the WPP account key only as ciphertext, so it follows WPP.

## Scope

**In:** the WPP client and storage seam, the backup, the backup targets, restore, backup states, the client read surface, the shared private-state provider, the `connect` and agent handoffs, and the WaaS adapter and backup owner key.

**Out:** multi-device sync (E14), restoring private history after recovery (E16), read grants and viewing-key rotation (E17), and injecting the provider in `connect` and `agent` (E19, E20).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E13.01 | WPP client and storage seam | 5 | core, adapter-wpp-drive |
| E13.02 | adapter-waas: k256 key and account metadata | 5 | adapter-waas, core |
| E13.03 | Password-wrapped WPP backup (to discuss) | 6 | owner, core |
| E13.04 | adapter-wpp-<backend> targets (Drive first) | 6 | adapter-wpp-drive |
| E13.05 | core: WPP PrivateStateProvider (one package key) | 6 | core |
| E13.06 | WPP restore on a new device | 7 | owner |
| E13.07 | Backup freshness state | 7 | owner |
| E13.08 | Client read surface and package-key handoff | 8 | core |
| E13.09 | connect: package-key handoff | 9 | connect, owner |
| E13.10 | agent: sealed package-key handoff | 9 | agent, owner, protocol |
| E13.11 | WaaS key as isolated backup owner key | 9 | owner, adapter-waas |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.03 Seam interface definitions, E03.04 Owner kernel secret boundary
- E04 Account deployment: E04.11 Multi-wave ACC deploy planner
- E11 Grant ceremony clients: E11.02 agent: agent-profile grant ceremony, E11.03 connect: browser grant ceremony
- E14 Devices and multi-device sync: E14.02 Owner key add and remove on the ACC

**Unlocks:** E14 Devices and multi-device sync (2 stories), E15 Passport app: backup and devices (2 stories), E16 Guardian recovery (2 stories), E17 Read-access lifecycle (1 story), E19 Connect for dApps (2 stories), E20 Agents (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A dApp's private state is written to WPP and read back through the provider, with only ciphertext in storage.
- A dApp cannot open another dApp's package.
- A test agent receives its package key sealed, and only it can open it.
- The private state is restored on a fresh device from the backup.
- The WaaS backup owner key is enrolled only with an isolating provider.

## Verification plan

- Unit tests for the package format, encryption, and integrity checks.
- The handoff end-to-end test in E15.
- A restore test on a fresh device against `adapter-wpp-drive`.
