# FS-0.3 — Kernel & command/state skeleton

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.3
> (re-sliced per [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`architecture.md`](../../../architecture.md) §3, §4.1, §4.3, §5,
> [`sdk-requirements.md`](../../../sdk-requirements.md) §2.2 and §2.5.
> **GitHub issue:** **#TBD** — kept as an open item (OQ-1); `spec-driver` must
> not plan until it is filled in.

## 1. Objective

Build the trusted centre of `@midnight-ntwrk/mn-passport-core`: the **kernel
secret boundary** (typed structure, stub crypto), the **staged command
pipeline** with its event stream, and the **composition point**
(`Passport.create`) the seam specs (FS-0.4–FS-0.8) plug into. This is
Approach 2 with Approach-3-shaped seams, made concrete (architecture §3, §8
decision 1).

## 2. Scope

### In (brief)

- **Kernel stubs** (architecture §4.1): the ACC session, the **ceremony
  gate**, the **witness lifecycle** (decrypt-under-ceremony → ephemeral handle
  → zeroise, as typed structure), and the **private-state envelope** shape.
- **Command pipeline skeleton** (architecture §4.3): authorise → build →
  prove → submit → confirm, one `CommandEvent` per stage, **proof provenance**
  first-class (requirements §2.5).
- **Reads-projection stub** — the observable surface reads will grow into.
- **`Passport.create({ signer, prover, settlement, storage, platform })`** —
  instance-scoped, disposable, no module globals (architecture §4.3, §4.6
  example 1).

### Out

- The five seam interfaces, their mocks, and their dev backends —
  **FS-0.4–FS-0.8** (ADR 0002).
- Adapter implementations (M1); real witness, ceremony, or envelope crypto;
  the command bus as primary API (the Approach-3 promotion, OQ-2); real flow
  logic (FS-1.2).

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | The kernel is the **only** code that ever holds decrypted secrets; they cross its boundary only as a sealed preimage or ciphertext, never plaintext to an adapter. | The prototype's deepest failure was secret containment; the invariant is the fix. | architecture §4.1 (invariant), §5 |
| D-2 | The **ceremony gate is the sole path to witness decryption** — stubbed here, never bypassable by construction. | No silent signing, no ambient authority. | requirements §2.2 |
| D-3 | Writes emit an event per stage, **provenance included** (where proved, who submitted). | Provenance must be surfaced truthfully; these events are what the UI and the standing reminder build on. | architecture §4.3; requirements §2.5 |
| D-4 | Composition is **constructor injection of the five seams**; the kernel names only interfaces, never a concrete adapter. | Keeps `core` portable, testable, and provider-free. | architecture §4.4; ADR 0002 |
| D-5 | Imperative writes now; the command bus is the recorded evolution, not v1. | Approach 2's discipline, Approach 3's shape. | architecture §3, §8 decision 1 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention). The seam types referenced here
> (`Signer`, `Prover`, …) are defined by FS-0.4–FS-0.8.

```ts
export interface PassportSeams {
  signer: Signer; prover: Prover; settlement: Settlement;
  storage: Storage; platform: Platform;
}
export class Passport {
  static create(seams: PassportSeams): Promise<Passport>;
  dispose(): Promise<void>;
  // command/state skeleton: writes run the staged pipeline; reads project
}

export type CommandEvent =
  | { stage: 'authorised' }
  | { stage: 'built' }
  | { stage: 'proved'; provenance: ProofProvenance }    // requirements §2.5
  | { stage: 'submitted'; by: 'passport' | 'service' }
  | { stage: 'confirmed'; txId: TxId };

// kernel-internal shapes (exported types, stub behaviour)
export interface WitnessHandle { /* ephemeral; zeroise() */ }
export interface CeremonyGate { require(): Promise<CeremonyProof> }  // stub
```

## 5. Flow

The skeleton encodes the ceremony-gated write end to end (architecture §5;
provider-integration §3), every step a typed stub until M1: the ceremony gate
fires → the witness lifecycle yields an ephemeral handle → build produces a
preimage → the kernel **seals** it and hands it to the Prover seam → the
Settlement seam balances and submits → finalisation confirms — each stage
emitting its `CommandEvent`. A test drives the whole sequence over the seam
mocks from FS-0.4–FS-0.8.

## 6. Dependencies

**Internal:** FS-0.1 (workspace, `core` skeleton); the **interface tranche**
of each seam spec FS-0.4–FS-0.8 (the kernel composes them). FS-0.2 is not
required to build (circuit coupling arrives with FS-1.1), but the account
metadata the kernel owns uses FS-0.2's version identifiers — the account's
binding version, recorded at deploy and re-derivable via
`detectDeployedVersion` (FS-0.2 §4.1). Downstream: FS-1.2
orchestrates onboarding through `Passport.create`.

**External gate:** none. Fully buildable against the seam mocks.

## 7. Acceptance criteria

1. `core` builds with the stub kernel under the strict config; still no
   platform API imports (FS-0.1 D-5).
2. `Passport.create` composes the five seam mocks and disposes cleanly (no
   globals — two instances coexist in one test).
3. One stub command emits the full ordered event sequence, provenance
   payload included, asserted in a unit test.
4. No kernel export leaks a decrypted secret type across the seam boundary
   (D-1) — the boundary assertion from the seam specs covers the kernel too.

## 8. Verify plan

- Unit tests driving the pipeline through the seam mocks (`midnight-cq`);
  event order and payloads asserted.
- Two-instance isolation test (D-4 / no-globals).
- No devnet or proof server needed; the local-environment validation lives in
  the seam specs (FS-0.5, FS-0.6).

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Kernel stubs | session, ceremony gate, witness lifecycle, envelope shapes | ~7 files, ≤ 250 net lines |
| T2 | Pipeline + events + composition | staged pipeline, `CommandEvent`, `Passport.create`/`dispose` | ~7 files, ≤ 300 net lines |
| T3 | Pipeline tests over the mocks | sequence, isolation, boundary assertions | ~4 files, ≤ 200 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Ceremony gate (requirements §2.2) | **Structurally seeded** — the gate is the only path to the witness lifecycle (D-2). |
| Encrypt preimage to enclave (§2.5) | Kernel-side sealing sits *before* the Prover seam in the pipeline; the seam type itself is FS-0.5's deliverable. |
| Deposit, not address (§3.12) | Not touched. |
| `connect` never links `core` (§4.4) | Preserved — surface added inside `core` only; the FS-0.1 lint stands guard. |
| Two version axes (§4.6) | Not touched — both live in the foundation packages. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run) — fill in here and in the brief before planning. | Human |
| OQ-2 | **Command-bus shape** (brief) — plain methods emitting `CommandEvent`s now (*lean*), command objects at the Approach-3 promotion. | Decide at T2; revisit at promotion |
| OQ-3 | **Ceremony-gate ↔ Platform split** — the gate is kernel-owned (D-2) but the WebAuthn/PRF call is platform territory; the exact hook shape is FS-0.8's OQ, resolved together. | Joint decision with FS-0.8 T1 |
