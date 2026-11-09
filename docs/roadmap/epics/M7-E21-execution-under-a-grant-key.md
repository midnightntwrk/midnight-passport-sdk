# E21 · Execution under a grant key

**Issue:** [#64](https://github.com/midnightntwrk/midnight-passport-sdk/issues/64)  
**Milestone:** 7 Execution · **Track:** SDK, shared client and integrations · **Steps:** 5–12 · **Stories:** 7  
**Packages:** `core`, `adapter-prover-wasm`, `connect`, `agent`, `adapter-nodejs`  
**Sheet code:** E4  
**Readiness:** ready, no story marked to discuss

## Goal

dApps and agents act under their grants: they sign with their own grant key, prove, and broadcast, with Passport closed, including payments and full reference examples.

## Description

Everything before this milestone connects dApps and agents to Passport. This epic makes them act. It holds the shared execution pipeline in `mn-passport-core`, and the `connect` and agent stories that use it.

**The call pipeline.** A call under a grant key builds the ACC challenge for the key's signing arm, signs it with the grant key, sends the unproven transaction to the prover, and broadcasts it through the sponsor. The owner key is never involved, and the Passport app does not need to be open (rule 9). `core` provides the pipeline; `connect` and `mn-passport-agent` use it.

**Joining intents.** A called contract cannot run a witness, so a shielded spend from the ACC starts its own intent. To pay and act in one transaction, a dApp builds both parts first, the ACC spend and its own circuit call, and the intent joiner combines them so they settle together. Neither part is submitted alone.

**Pay with Passport.** A dApp asks for a payment, the user approves it in the Passport app, and the payment is a deposit call joined with the dApp's intent, never a raw address transfer (rule 3).

**Agents.** The agent runs calls on Node.js through `adapter-nodejs`, with the same pipeline, after checking its grant status.

**Reference dApp.** A working example that uses every `connect` feature: sign-in, grant, handoff, private state, calls, and Pay with Passport. It is the base for the full end-to-end suite.

**Later.** The in-browser prover (`adapter-prover-wasm`) comes after V1, starting with small dApp circuits, because ACC proving keys are 112–224 MB.

## Scope

**In:** the grant-key call pipeline, the intent joiner, calls with Passport closed, Pay with Passport, agent execution, the reference dApp, and the in-browser prover (after V1).

**Out:** the grant ceremony (E11), the handoff (E13), and the full end-to-end suite (E22).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E21.01 | Intent joiner: dApp intent + ACC payment | 5 | core |
| E21.02 | adapter-prover-wasm (after V1) | 6 | adapter-prover-wasm |
| E21.03 | Grant-key call pipeline: sign, prove, broadcast | 10 | core |
| E21.04 | connect: grant-key calls, Passport closed | 11 | connect |
| E21.05 | connect: Pay with Passport (deposit + joiner) | 11 | connect, core |
| E21.06 | agent: grant-key calls on Node.js | 11 | agent, core, adapter-nodejs |
| E21.07 | Reference dApp | 12 | connect |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.02 KeyProvider across k256, p256, and JubJub, E04.03 adapter-prover-remote, E04.04 adapter-broadcast: submit, finality, resubmit, E04.05 adapter-browser and adapter-nodejs
- E05 Contract binding: E05.03 ACC artifact loader (module, decoder, manifest)
- E07 Payments: E07.02 Transfers via deposit calls
- E10 Scoped grants ceremony: E10.04 On-chain grant reads and scope helpers
- E11 Grant ceremony clients: E11.02 agent: agent-profile grant ceremony, E11.03 connect: browser grant ceremony
- E19 Connect for dApps: E19.01 connect project template, E19.03 connect: inject the PrivateStateProvider
- E20 Agents: E20.04 agent: inject the PrivateStateProvider

**Unlocks:** E22 Integration hardening (1 story), E24 Cross-chain assets (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- On devnet, a dApp makes a call under its grant key with the Passport app closed.
- A dApp takes a payment with Pay with Passport, joined with its own call in one transaction.
- A test agent runs a dApp circuit under its grant on Node.js.
- The reference dApp runs every flow.

## Verification plan

- Devnet tests for a grant-key call, a joined payment, and an agent call.
- A test that a call fails cleanly when the grant is revoked or the scope is exceeded.
