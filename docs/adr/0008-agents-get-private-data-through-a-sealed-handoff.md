# 0008 — Agents get private data through a sealed handoff

Date: 2026/11/09 · Status: proposed
Refs: requirements, open question 3 · realignment open question 3 · ADR 0007

## Context

A dApp gets the key of its WPP package at the handoff, and `connect` wraps it
as a midnight-js `PrivateStateProvider`. An agent runs the circuit of a dApp
too, but the docs left open whether it may read that dApp's private state. The
seam tables marked private state and storage "agents: open". Without the
private state, an agent cannot run a circuit whose witnesses need it.

## Decision

1. **Agents get private data.** An agent that runs the circuit of a dApp gets
   the key of that dApp's WPP package, and only that key.
2. **The same consents and the same tap.** Private-state access is a separate
   consent from the grant, as for a dApp. The handoff completes with the tap of
   the grant ceremony.
3. **A sealed handoff.** The agent profile has no redirect. The agent request
   carries an encryption public key that the agent's self-signature binds.
   Passport seals the package key to it and returns it with the readable scope
   and its salt, on the channel the agent profile already uses. Only the agent
   can open it. The exact sealing scheme is for the spec.
4. **One provider for both.** The private-state provider of the WPP client in
   `mn-passport-core` serves both `connect` and `mn-passport-agent`. Neither
   links `owner` (rule 4).

## Consequences

- `docs/sdk-requirements.md` closes open question 3 and adds the sealed handoff
  to "Agents" and "Private data".
- `docs/architecture.md` lists `mn-passport-agent` as a user of the private
  state and storage seams, adds the sealed handoff to "What leaves the kernel"
  and the boundary diagram, and updates example 4.
- `mn-passport-protocol` gets the encryption key in the agent-profile grant
  request and the sealed package key in the response. This changes the wire
  format, so it bumps `PROTOCOL_VERSION`.
- The conformance lens checks that an agent gets the package key only sealed.
  ADR 0007 records this item as closed.
- Rule 13 applies unchanged: revoking private-state access rotates the package
  key, for a dApp and for its agents alike.
- Open: a dApp and its agent can write to the same package. The spec must say
  how the WPP conflict retention handles two writers.
