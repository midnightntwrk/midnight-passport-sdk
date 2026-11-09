# E20 · Agents

**Issue:** [#63](https://github.com/midnightntwrk/midnight-passport-sdk/issues/63)  
**Milestone:** 6 Integrations · **Track:** SDK, shared client and integrations · **Steps:** 7–10 · **Stories:** 4  
**Packages:** `agent`, `owner`, `protocol`, `core`  
**Sheet code:** E11  
**Readiness:** ready, no story marked to discuss

## Goal

Complete `mn-passport-agent` so an AI agent is fully connected to Passport: a readable scope, on-chain grant checks before every action, its own identity, and access to private data.

## Description

AI agents act for users, so the user must always know what an agent may do, and be able to turn it off. By this milestone, the agent's key and grant ceremony exist (E11, milestone 3) and so does its sealed handoff (E13, milestone 4). This epic completes the library around them. Execution under the grant follows in E21.

**Readable scope.** The shared scope type from E10 is rendered as sentences, such as "may spend up to 50 NIGHT until Friday", for the approval page and for the agent's own logs.

**Grant status.** Before OWS signs anything, `mn-passport-agent` reads the grant from the ACC: its status and the commitments the readable scope opens. OWS then enforces the grant as its policy. This is a read of the chain, not a check on a server.

**Identity.** The agent gets an identity tied to its grant, limited to one per person per service. Revoking the grant ends the identity.

**Private state.** The agent wraps its sealed package key as the private-state provider from `core`, so the witnesses of the dApp circuit it runs can read and write that dApp's private state (ADR 0008). A dApp and its agent can write to the same package; how WPP handles two writers is still open.

`mn-passport-agent` never links `owner` (rule 4).

## Scope

**In:** scope-to-text rendering, grant status checks for OWS, the agent identity, and injecting the private-state provider.

**Out:** the agent key and ceremony (E11), the sealed handoff (E13), and execution on Node.js (E21).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E20.01 | Scope-to-text rendering | 7 | agent, owner, protocol |
| E20.02 | Agent identity bound to its grant | 7 | agent |
| E20.03 | agent: grant status checks for OWS | 10 | agent, core |
| E20.04 | agent: inject the PrivateStateProvider | 10 | agent, core |

## Dependencies

**Blocked by:**
- E10 Scoped grants ceremony: E10.01 Shared scope type for all grantees, E10.04 On-chain grant reads and scope helpers
- E11 Grant ceremony clients: E11.01 OWS key provider for agents
- E13 Private data and backup: E13.05 core: WPP PrivateStateProvider (one package key), E13.10 agent: sealed package-key handoff

**Unlocks:** E21 Execution under a grant key (1 story).

**Parallel with:** E19 Connect for dApps.

## Exit criteria

- A test agent reads its grant status before each action and stops when the grant is revoked.
- The readable scope is shown on the approval page and matches the on-chain grant.
- The test agent reads and writes a dApp's private state through the injected provider.

## Verification plan

- Integration tests with the test agent on devnet.
- A test that a revoked grant stops the agent before OWS signs.
