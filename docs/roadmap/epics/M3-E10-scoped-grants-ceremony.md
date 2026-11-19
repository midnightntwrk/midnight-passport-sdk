# E10 · Scoped grants ceremony

**Issue:** [#53](https://github.com/midnightntwrk/midnight-passport-sdk/issues/53)  
**Milestone:** 3 Control · **Track:** SDK, owner and foundation · **Steps:** 6–10 · **Stories:** 8  
**Packages:** `protocol`, `core`, `owner`  
**Sheet code:** E7  
**Readiness:** ready, no story marked to discuss

## Goal

The owner gives a dApp or an agent its own limited key, a grant, with one passkey tap in the Passport app, and can review and revoke it at any time.

## Description

Grants are what make Passport different from a wallet. Instead of handing a dApp the keys to the account, the owner approves a narrow scope once, and the dApp or agent then signs with its own grant key, with Passport closed. The owner key is used only at issuance and revocation, never in the dApp's later calls.

**The scope.** One permission model applies to every grantee: which operations, which assets, which limits, and until when. The same scope type is used for devices, dApps, and agents.

**Issuing.** A request arrives from a dApp or an agent (E09). The authorizer page in `owner` (MIP §9) validates it and shows exactly what is being asked. The user approves with one passkey tap (rule 1), and `owner` calls `issue_grant` on the ACC, signed with the owner key. There is one grantee key for each account and each origin (rule 10), so a second request from the same origin replaces the first.

**Reading.** On-chain grant reads in `core` answer whether a key may run a circuit, spend an asset, or act after a given time. They are shared by `connect` and `agent`, and the grant list is always read from the chain, so it is the same on every device.

**Revoking.** Revocation is a call on the ACC, signed with an owner key. The dApp or agent sees it on its next grant read.

**Spend limits and child Passports.** A grant can carry a spending limit and an expiry, enforced by the ACC on chain. A child Passport is a subdomain name under the owner's (such as agent.maya.night) backed by its own grant, which the parent can revoke.

This epic covers grants without read access. Grants that can read private data need the viewing-key rotations of rule 13, which depend on sync and recovery, so they are in E22.

## Scope

**In:** the shared scope type, the authorizer page logic, `issue_grant`, on-chain grant reads, the grant list, revocation, spend-limited grants, and child Passports.

**Out:** the client side of the ceremony (E11), the app screens (E12), read grants and viewing-key rotation (E22), and the private-data handoff (E18).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E10.01 | Shared scope type for all grantees | 6 | protocol, core |
| E10.02 | Authorizer page (MIP §9) | 7 | owner |
| E10.03 | issue_grant call | 8 | owner |
| E10.04 | On-chain grant reads and scope helpers | 9 | core |
| E10.05 | Grant revocation call | 9 | owner |
| E10.06 | Spend-limited grant | 9 | owner |
| E10.07 | Grant listing from chain | 10 | owner |
| E10.08 | Child Passport: subdomain name and grant | 10 | owner |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.12 Account deploy in waves: plan, send, resume, activate
- E09 Scoped grants foundation: E09.01 GrantRequest: browser profile, E09.02 GrantRequest: agent profile

**Unlocks:** E11 Grant ceremony clients (1 story), E12 Passport app: grants (3 stories), E14 Agents (2 stories), E15 Execution under a grant key (1 story), E22 Read-access lifecycle (3 stories).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- On devnet, a grant is issued with one tap and is readable on chain with its scope.
- A second request from the same origin replaces the first grant.
- A revoked grant fails its next read, and its calls fail.
- A spend-limited grant cannot exceed its limit on chain.
- A child Passport is created and revoked by its parent.

## Verification plan

- Unit tests for scope encoding and the grant-read helpers.
- Devnet tests for issue, read, revoke, and the spend limit.
- The end-to-end ceremony tests in E12.
