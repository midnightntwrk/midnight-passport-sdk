# 0011 — The seam list, a new indexer seam, and fees apart from broadcast

Date: 2026/11/18 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#84 · architecture, sections "Seams"
and "Adapters"

## Context

A seam is an interface with interchangeable adapters. The docs did not agree on
the list:

- `architecture.md` listed 12 seams and no indexer. The board story listed 9,
  with an indexer seam. The broadcast and indexer stories need one.
- The board story put the registry seam in `core`. `architecture.md` put it in
  `contract`.
- `architecture.md` said that the sponsor pays the fees and broadcasts. The
  sponsor policy draft (issue 73, not merged) says that the sponsor returns
  the paid transaction and the client submits it. The sponsor that we tested
  does this.
- No doc said where plain local data goes, such as the local account record
  and the deploy resume state. The storage seam is for ciphertext only.

## Decision

1. **The list.** Thirteen seams:

   | Seam | Defined in | Written by |
   |---|---|---|
   | Key provider, prover, fees, broadcast, platform, account metadata | `core` | E03.03 |
   | Indexer (new) | `core` | E03.03 |
   | Private state, storage | `core` | E17.01 |
   | Multi-chain | `core` | E25.01, after V1 |
   | Registry | `contract` | The dApp artifact loader, in the agents epic |
   | Recovery | `owner` | E21.02 |
   | DID | `owner` | E24 |

2. **The indexer seam** reads contract state and transaction status, once or
   as a `StateSource`. It also reads the ledger parameters, the inputs of a
   call, and the Zswap events of a block, once. "Not found" is a value, and a
   source that cannot be reached is an error. `adapter-indexer` implements it,
   over the indexer and the node.
3. **Fees and broadcast are two seams.** Fees takes a proven transaction and
   returns the paid transaction. Broadcast submits the paid transaction and
   waits to the level that the caller asks for, `in-block` or `final`.
   `adapter-broadcast` implements both seams for the sponsor route. The
   Capacity Exchange adapter implements fees only.
4. **The registry seam stays in `contract`.** Only the agent library uses it,
   and `contract` loads the artifacts that it checks.
5. **The platform seam holds plain local data**, with a list and a wipe. It
   also gives HTTP, random bytes, the WASM boot step, and WebAuthn. Nothing
   secret goes into the local store in readable form.
6. **The seam shape.** A transaction crosses a seam as serialized bytes in one
   of three stages: unproven, proven, or paid. Seams use no DOM, Node.js, or
   midnight-js type. Each method that calls a service or prompts the user
   takes an abort signal. Reads that change over time are `StateSource`
   values, and writes return Promises (ADR 0010).

Rejected options:

- **One broadcast seam that pays and submits.** The Capacity Exchange route
  would then need its own broadcast part.
- **The registry seam in `core`.** dApps and the Passport app would load a
  seam that they never use.
- **Local data in the storage seam.** The storage seam would then hold
  plaintext.

## Consequences

- `docs/architecture.md` has the indexer row and `adapter-indexer`, and the
  fees and broadcast rows match decision 3.
- `provider-integration.md` and `sdk-requirements.md` still say that the
  sponsor broadcasts. They disagree with this ADR until a `doc-sync` corrects
  them. The sponsor policy story (issue 73) owns those sections.
- `core` orders the calls: it pays just before the submit, and it holds at most
  one paid, unsent transaction for each account.
- Each seam has an in-memory stub and a contract test in `dev`. An adapter runs
  the same test.
- A seam that a later story writes gets no code until then.
