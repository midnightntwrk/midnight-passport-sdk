# E14 · Agents

**Issue:** [#63](https://github.com/midnightntwrk/midnight-passport-sdk/issues/63)  
**Milestone:** 4 Integrations · **Track:** SDK, shared client and integrations · **Steps:** 7–10 · **Stories:** 3  
**Packages:** `agent`, `owner`, `protocol`, `core`  
**Sheet code:** E11  
**Readiness:** ready, no story marked to discuss

## Goal

Complete `mn-passport-agent` so an AI agent is fully connected to Passport: a readable scope, on-chain grant checks before every action, and its own identity.

## Description

AI agents act for users, so the user must always know what an agent may do, and be able to turn it off. By this milestone, the agent's key and grant ceremony exist (E11, milestone 3). This epic completes the library around them. Execution under the grant follows in E15 (milestone 5), and the sealed handoff and private state in E18 (milestone 6).

**Readable scope.** The shared scope type from E10 is rendered as sentences, such as "may spend up to 50 NIGHT until Friday", for the approval page and for the agent's own logs.

**Grant status.** Before OWS signs anything, `mn-passport-agent` reads the grant from the ACC: its status and the commitments the readable scope opens. OWS then enforces the grant as its policy. This is a read of the chain, not a check on a server.

**Identity.** The agent gets an identity tied to its grant, limited to one per person per service. Revoking the grant ends the identity.

`mn-passport-agent` never links `owner` (rule 4).

## Scope

**In:** scope-to-text rendering, grant status checks for OWS, and the agent identity.

**Out:** the agent key and ceremony (E11), execution on Node.js (E15), and the sealed handoff and private state (E18).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E14.01 | Scope-to-text rendering | 7 | agent, owner, protocol |
| E14.02 | Agent identity bound to its grant | 7 | agent |
| E14.03 | agent: grant status checks for OWS | 10 | agent, core |

## Dependencies

**Blocked by:**
- E10 Scoped grants ceremony: E10.01 Shared scope type for all grantees, E10.04 On-chain grant reads and scope helpers
- E11 Grant ceremony clients: E11.01 OWS key provider for agents

**Unlocks:** no other epic waits on it.

**Parallel with:** E13 Connect for dApps.

## Exit criteria

- A test agent reads its grant status before each action and stops when the grant is revoked.
- The readable scope is shown on the approval page and matches the on-chain grant.

## Verification plan

- Integration tests with the test agent on devnet.
- A test that a revoked grant stops the agent before OWS signs.
