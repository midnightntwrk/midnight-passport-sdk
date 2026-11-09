# E11 · Grant ceremony clients

**Issue:** [#54](https://github.com/midnightntwrk/midnight-passport-sdk/issues/54)  
**Milestone:** 3 Control · **Track:** SDK, shared client and integrations · **Steps:** 6–8 · **Stories:** 3  
**Packages:** `agent`, `protocol`, `connect`  
**Sheet code:** none, new epic  
**Readiness:** ready, no story marked to discuss

## Goal

Build the client side of the grant ceremony early, so a real dApp and a real agent can receive a grant in milestone 3 instead of at the end of the roadmap.

## Description

The ceremony is the riskiest flow in the system: a redirect across two origins, a possession proof, an origin binding, and for agents a self-signed request over a QR code or link. If the clients only arrived with the integrations, the first real test of that flow would come last. This epic pulls the client side forward, next to the Passport side in E10. It is new and not in the sheet; its stories came from E13 and E14.

**dApps.** `connect` builds the browser-profile `GrantRequest`, makes the grant key on the dApp's origin, redirects the user to the Passport app, and receives the result when the user comes back.

**Agents.** The agent's key lives in OWS, which acts as the key provider for `mn-passport-agent`. The agent builds the agent-profile request, shows it as a QR code or a link, and receives the readable scope and its salt once the user approves.

Both clients stop at the grant. Calls under the grant key follow in E15, and the private-data handoff in E18, once WPP exists.

## Scope

**In:** the `connect` browser grant ceremony, the OWS key provider, and the agent-profile grant ceremony.

**Out:** the package-key handoffs (E18), calls under a grant key (E15), and the rest of `connect` and `agent` (E13, E14).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E11.01 | OWS key provider for agents | 6 | agent |
| E11.02 | agent: agent-profile grant ceremony | 7 | agent, protocol |
| E11.03 | connect: browser grant ceremony | 8 | connect |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.02 KeyProvider across k256, p256, and JubJub
- E09 Scoped grants foundation: E09.01 GrantRequest: browser profile, E09.02 GrantRequest: agent profile
- E10 Scoped grants ceremony: E10.02 Authorizer page (MIP §9)

**Unlocks:** E12 Passport app: grants (2 stories), E13 Connect for dApps (1 story), E14 Agents (1 story), E15 Execution under a grant key (2 stories), E18 Private data in connect and agent (2 stories).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- A test dApp completes the browser ceremony against the Passport app on devnet and holds a working grant key.
- A test agent completes the agent ceremony and holds its readable scope and salt.

## Verification plan

- The two end-to-end ceremony tests in E12 run in CI.
- Unit tests for the request building and the response checks on both clients.
