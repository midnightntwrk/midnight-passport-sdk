# E22 · Read-access lifecycle

**Issue:** [#60](https://github.com/midnightntwrk/midnight-passport-sdk/issues/60)  
**Milestone:** 7 Account recovery · **Track:** SDK, owner and foundation · **Steps:** 13–14 · **Stories:** 3  
**Packages:** `owner`, `connect`  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Support grants that can read the account's private data, with the viewing-key rotations that make revoking them real.

## Description

Some grants need to read private data, for example a dApp that shows a user's private balance. That needs the viewing key, which then leaves the kernel whole. Revoking such a grant does not take back what was already read, so the only way to end the access is to rotate the viewing key. This epic is new and not in the sheet; its stories came from E10.

**The lifecycle (rule 13).** Rotate the viewing key before sharing it, re-seal or mark for reconnection after each rotation, and rotate again on revocation. The viewing key goes whole only to the holder of a read grant, after a separate consent.

**Why it comes after sync and recovery.** Each rotation has two consequences. The new viewing key must be re-sealed to every device on the account (E19). And the recovery wrap must be renewed, so a later recovery restores the current key (E21, rule 15). Doing rotations before those exist would leave devices or recovery with a stale key.

**The client side.** When a read grant is revoked, `connect` handles the dApp losing access on its next read.

**The cost.** Each rotation needs a full-roster recovery session today. Whether that cost is acceptable, or whether the SDK waits for a MIP-0022 rewrap, is open question 14 in the requirements.

## Scope

**In:** viewing-key rotation on revocation, the read-grant viewing-key lifecycle, and `connect`'s handling of a revoked read grant.

**Out:** grants without read access (E10).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E22.01 | Viewing-key rotation on revocation | 13 | owner |
| E22.02 | Read-grant viewing-key lifecycle (rule 13) | 13 | owner |
| E22.03 | connect: read-grant revocation handling | 14 | connect, owner |

## Dependencies

**Blocked by:**
- E10 Scoped grants ceremony: E10.03 issue_grant call, E10.05 Grant revocation call
- E17 Private data and backup: E17.02 Password-wrapped WPP backup
- E18 Private data in connect and agent: E18.01 connect: package-key handoff
- E19 Devices and multi-device sync: E19.04 Viewing-key distribution to each device
- E21 Guardian recovery: E21.11 Recovery wrap renewal and state restore

**Unlocks:** no other epic waits on it.

**Parallel with:** E23 Passport app: recovery.

## Exit criteria

- On devnet, a read grant is issued, revoked, and the viewing key rotates.
- After the rotation, every device has the new viewing key.
- After the rotation, a recovery restores the new viewing key, not the old one.
- After a read-grant revocation, a dApp loses access on its next read and handles it cleanly.

## Verification plan

- Devnet tests for the full read-grant lifecycle across two devices.
- A recovery test after a rotation.
