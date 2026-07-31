# FS-0.5 — Prover seam & local proof server

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.5
> (per-seam split: [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`provider-integration.md`](../../../provider-integration.md) §5.1,
> [`architecture.md`](../../../architecture.md) §4.2.1,
> [`sdk-requirements.md`](../../../sdk-requirements.md) §2.5,
> [`beta-scope.md`](../../../beta-scope.md) §2 item 3.
> **GitHub issue:** **#TBD** — open item (OQ-1); no plan until filled in.

## 1. Objective

Define the **proving seam** and ship a **dev prover** that drives the **local
proof server** the `devenv` skill already gates — so proving works end-to-end
on a developer machine before the remote service exists. FS-1.4
(`adapter-prover-remote`) later extends this same client with enclave sealing
and the remote endpoint (ADR 0002), rather than rebuilding it.

## 2. Scope

### In (brief)

- **The `Prover` interface**: `prove(preimage, keyLocation) → proof` and
  `check(preimage, keyLocation)` — binary in/out
  (`application/octet-stream`-shaped), key **by reference** so no prover key
  ever ships from the device (provider-integration §5.1).
- **A preimage-envelope type** carrying the sealing mode, so the sealed
  (remote) and cleartext (local dev) cases are distinguished *in the type*,
  not by convention.
- **A mock** (canned proof bytes) for FS-0.3's pipeline tests.
- **The dev prover**: an HTTP client to the local proof server, with a
  **loopback-only guard** — the cleartext mode refuses any non-loopback
  endpoint by construction.
- **A local prove end-to-end test** over a prototype-ACC circuit, using
  FS-0.2's ZK config.

### Out

- **Sealing to the enclave key and the remote service** — FS-1.4, which the
  §2.5 MUST fully governs.
- **The k-threshold router** — beta routes everything to one prover
  (beta-scope §2 item 3); the seam leaves room for the router as a future
  composite `Prover` (architecture §4.2.1), not built here.
- Retry/timeout hardening for multi-minute remote proofs (FS-1.4;
  provider-integration §5.1 table).

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | The seam speaks **preimage + `keyLocation`**, binary in/out; the prover resolves keys itself. | Matches the delegated-proving interface; uploading 10–80 MB prover keys is the main mobile cost and the keys are public. | provider-integration §5.1, §6 |
| D-2 | The envelope carries its **sealing mode**: `{ sealedTo: 'enclave', bytes }` for any remote prover, `{ mode: 'local-cleartext', bytes }` for the dev prover only. | Encodes the §2.5 MUST in the type system while admitting the stock local proof server, which has no enclave key. | requirements §2.5; provider-integration §5.1 |
| D-3 | The cleartext mode is **loopback-guarded**: the dev prover refuses any endpoint that is not `localhost`/`127.0.0.1`/`::1`. | A cleartext preimage may encode a witness; it must be physically unable to leave the machine. | requirements §2.5 (the risk the MUST protects against); ADR 0002 |
| D-4 | The dev prover lives in **`packages/dev`**, private, never published. | Dev-grade posture must be un-shippable. | ADR 0002 |
| D-5 | `check` is carried alongside `prove` from day one. | Pre-validation of public transcript values is part of the upstream contract; retrofitting it later would churn the seam. | provider-integration §5.1 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── @midnight-ntwrk/mn-passport-core ──
export type PreimageEnvelope =
  | { sealedTo: 'enclave'; bytes: Uint8Array }          // remote path (M1)
  | { mode: 'local-cleartext'; bytes: Uint8Array };     // dev prover ONLY (D-3)

export interface Prover {
  prove(preimage: PreimageEnvelope, keyLocation: string): Promise<Uint8Array>;
  check(preimage: PreimageEnvelope, keyLocation: string): Promise<Uint8Array>;
}

// ── packages/dev (private) ──
export function localProofServerProver(opts: { url: string }): Prover;
// throws on construction if opts.url is not loopback (D-3)
export function mockProver(cannedProof?: Uint8Array): Prover;
```

## 5. Flow

Local development mirrors provider-integration §3 steps 5–7 with the local
proof server standing in for the service's TEE: the kernel hands the dev
prover a `local-cleartext` envelope + `keyLocation` → `POST /prove`
(octet-stream) to the loopback server → proof bytes return → the pipeline
continues to Settlement (FS-0.6). `check` follows the same path for
pre-validation. The remote flow — sealing first, enclave decrypts — is
FS-1.4's; nothing in this spec sends bytes off the machine.

## 6. Dependencies

**Internal:** FS-0.1; **FS-0.2** (the ZK config and `keyLocation` for a real
circuit — the e2e test proves a prototype-ACC circuit). Downstream: FS-0.3
consumes the mock; FS-0.6's e2e settles the proof this spec produces; FS-1.4
extends the client.

**External gate:** none. The local proof server and Compact CLI are
`mn-passport-skills:devenv`'s to provide, not an external party's.

## 7. Acceptance criteria

1. Mock and dev prover satisfy the seam and its conformance test.
2. **A valid proof is produced locally** — the dev prover proves a
   prototype-ACC circuit against the local proof server, and the proof
   verifies against the circuit's verifier key (FS-0.2's artefact).
3. **The loopback guard holds** — constructing the dev prover with any
   non-loopback URL throws; passing a `sealedTo: 'enclave'` envelope to the
   dev prover is rejected (it cannot unseal), and a `local-cleartext`
   envelope is rejected by type where a remote prover is expected.
4. `check` returns the public transcript values for the same circuit.
5. `packages/dev` remains un-linkable from publishable packages.

## 8. Verify plan

- **The local prove e2e** (criterion 2) — compile the prototype artefact
  (Compact CLI), start the proof server (`devenv` doctor first), prove, and
  verify. This is the spec's core "does it run".
- **Guard mutation tests** — non-loopback URL, wrong envelope variant; both
  must fail; revert.
- **Mocks:** none stand in for anything — the local proof server is real.
  The *remote* posture (sealing, attestation trust) is explicitly deferred to
  FS-1.4 and recorded as such, not simulated here.

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Interface + envelope + mock | seam types, `PreimageEnvelope`, mock, conformance test | ~5 files, ≤ 200 net lines |
| T2 | Local proof-server client + guard | HTTP client (octet-stream), loopback guard, guard tests | ~5 files, ≤ 250 net lines |
| T3 | Local prove e2e | fixture circuit wiring over FS-0.2, prove + check + verify test | ~4 files, ≤ 200 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Encrypt the proof preimage to the enclave (§2.5) | **Actively encoded and scoped** — the envelope type makes sealing explicit; the only cleartext path is loopback-guarded, dev-only, and un-publishable (D-2–D-4). Every remote path requires the `sealedTo: 'enclave'` variant. |
| Ceremony gate (§2.2) | Upstream of this seam (kernel, FS-0.3); nothing here touches witness decryption. |
| Deposit, not address (§3.12) | Not touched. |
| `connect` never links `core` (§4.4) | Preserved. |
| Two version axes (§4.6) | Not touched — `keyLocation`/ZK config ride FS-0.2's pinned artefact. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run). | Human |
| OQ-2 | **Envelope shape vs the stock proof-server API** (brief) — does the stock local server accept the raw preimage blob as-is, or is a thin framing needed so the same client serves sealed remote payloads later? | Resolve at T2 against the running server; feeds FS-1.4 |
| OQ-3 | **The upstream sealing scheme** — HPKE to the enclave key vs RA-TLS (provider-integration §9) fixes what `sealedTo: 'enclave'` means concretely. Does not block this spec; blocks FS-1.4. | Provider/service confirmation; `doc-sync` |
| OQ-4 | **Proving timeout defaults** for the local server (the 5-minute/retry table in §5.1 is written for the remote service). | Decide at T2 |
