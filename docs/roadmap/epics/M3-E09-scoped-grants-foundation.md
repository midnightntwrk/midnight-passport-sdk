# E09 · Scoped grants foundation

**Issue:** [#52](https://github.com/midnightntwrk/midnight-passport-sdk/issues/52)  
**Milestone:** 3 Control · **Track:** SDK, owner and foundation · **Steps:** 5–5 · **Stories:** 4  
**Packages:** `protocol`  
**Sheet code:** E5  
**Readiness:** ready, no story marked to discuss

## Goal

Define the messages that a dApp or an agent sends to the Passport app to ask for a grant or to sign a user in, so both sides agree on them at compile time.

## Description

The grant ceremony has two sides that ship separately: the client side (`connect` for dApps, `mn-passport-agent` for agents) and the Passport app side (`owner`). They can only interoperate if they share the exact message format. `mn-passport-protocol` holds those messages as types, with no logic, so a change on one side fails to compile on the other.

**One request, two profiles.** Both dApps and agents send the same `GrantRequest`. The difference is the binding. The *browser profile* binds the request to the dApp's web origin with a possession proof, and is delivered by redirect. The *agent profile* has no web origin: it binds the agent's key with a self-signature, a nonce, an expiry, and a label, and is delivered as a QR code or a link.

**Sign-in.** The sign-in message (MIP §10) lets a dApp verify who the user is, by account and name, without asking for a grant.

**Versions.** The messages carry `PROTOCOL_VERSION`, the wire axis of rule 5. An older Passport app rejects a newer message with a typed error instead of misreading it. Every message also uses the domain-separation tags from E03, so a signature made for one message can never be replayed as another.

## Scope

**In:** the browser-profile and agent-profile grant requests, the sign-in message, and version handling.

**Out:** building or verifying the ceremony itself (E10, E11), and the encryption key the agent request will carry for the sealed handoff (ADR 0008, added with E13).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E09.01 | GrantRequest: browser profile | 5 | protocol |
| E09.02 | GrantRequest: agent profile | 5 | protocol |
| E09.03 | Sign-in message (MIP §10) | 5 | protocol |
| E09.04 | PROTOCOL_VERSION handling | 5 | protocol |

## Dependencies

**Blocked by:**
- E03 Workspace, seams, and guardrails: E03.05 Wire and binding version axes, E03.08 Domain-separation tag constants

**Unlocks:** E10 Scoped grants ceremony (2 stories), E11 Grant ceremony clients (2 stories), E19 Connect for dApps (1 story).

**Parallel with:** E12 Passport app: grants.

## Exit criteria

- The three message types and their tags are published in `protocol`.
- A message with a newer `PROTOCOL_VERSION` is rejected with a typed error.
- Test vectors exist for each message, for both sides to test against.

## Verification plan

- Round-trip tests for each message and each profile.
- A cross-version test with an older and a newer message.
