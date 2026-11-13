# E21 · Guardian recovery

**Issue:** [#59](https://github.com/midnightntwrk/midnight-passport-sdk/issues/59)  
**Milestone:** 7 Account recovery · **Track:** SDK, owner and foundation · **Steps:** 5–12 · **Stories:** 11  
**Packages:** `owner`, `protocol`, `adapter-recovery`, `core`  
**Sheet code:** E9  
**Readiness:** ready, no story marked to discuss

## Goal

Trusted guardians help a user get back into the same account, with its private history, after losing every device.

## Description

Passkeys and synced devices cover most losses, but not all. If every device and the passkey provider are lost, the user needs another way back that does not depend on a company holding their keys. Guardian recovery is that way: people or services the user trusts each hold a share, and enough of them together can restore the account. The scheme follows MIP-0022, and the recovery secret lives in the owner kernel (ADR 0006).

**Setting up.** The user picks guardians and a threshold. The kernel splits a recovery secret into shares and seals one to each guardian. The SDK warns when guardians share a provider, a device, or a household, and passkey guardians alone never reach the threshold without an explicit override (rule 16).

**Recovering.** On a new device, the user asks the guardians for help. Each guardian's Passport app shows the request, asks for a tap and a confirmation of the account, and returns its share sealed to the recovering device (rule 17). Shares travel through `adapter-recovery`, which carries sealed messages only. With enough shares, the new device rebuilds the secret in its kernel and starts the recovery on chain. The account address stays the same.

**The waiting period.** Recovery does not finish at once. Any remaining owner device can cancel it during the delay, which is the main defense against guardians who collude. Alerts go to every device and channel as soon as a recovery starts (rule 18). After the delay, the new owner key is installed and the old ones are removed.

**Private history.** The recovery secret also unwraps the viewing key, so a recovered account gets back its private data, not just its keys. The wrap is renewed after each viewing-key rotation.

**Interop.** Recovery with the WaaS backup owner key comes earlier, in E04. Shared test vectors make sure every guardian client implementation behaves the same.

## Scope

**In:** the recovery messages, the guardian transport, guardian setup and diversity checks, the share response, recover, cancel, finalize, alarms, restoring private history, and the interop vectors.

**Out:** recovery with the WaaS backup key (E04), the recovery screens (E23), and read-grant rotations (E22), which renew the wrap this epic creates.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E21.01 | MIP-0022 recovery message types | 5 | owner, protocol |
| E21.02 | adapter-recovery: sealed guardian transport | 6 | adapter-recovery |
| E21.03 | Recovery interop test vectors | 6 | owner, protocol |
| E21.04 | Guardian share response | 7 | owner |
| E21.05 | Guardian enrollment and share sealing | 9 | owner |
| E21.06 | Guardian diversity checks | 10 | owner |
| E21.07 | Secret reconstruction and recovery start | 10 | owner |
| E21.08 | Recovery cancel from a remaining owner key | 11 | owner |
| E21.09 | Recovery finalize after the delay | 11 | owner |
| E21.10 | Recovery-start alerts | 11 | owner |
| E21.11 | Recovery wrap renewal and state restore | 12 | owner, core |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.08 Domain-separation tag constants
- E17 Private data and backup: E17.05 WPP restore on a new device
- E19 Devices and multi-device sync: E19.02 Owner key add and remove on the ACC

**Unlocks:** E22 Read-access lifecycle (2 stories), E23 Passport app: recovery (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- On devnet, a user with three guardians and a threshold of two recovers the same account on a fresh device, with its private history.
- A recovery started by colluding guardians is cancelled from a remaining device.
- Every enrolled device raises an alert when a recovery starts.

## Verification plan

- The MIP-0022 interop vectors pass.
- Devnet tests for recover, cancel, and finalize.
- A test that no share or secret appears in plaintext outside the kernel.
