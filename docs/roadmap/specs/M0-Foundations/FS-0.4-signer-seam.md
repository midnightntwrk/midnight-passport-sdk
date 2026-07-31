# FS-0.4 — Signer seam & dev signer

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.4
> (per-seam split: [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`provider-integration.md`](../../../provider-integration.md) §4.1,
> [`architecture.md`](../../../architecture.md) §4.2,
> [`sdk-requirements.md`](../../../sdk-requirements.md) §2.1 and §2.3,
> [ADR 0001](../../../adr/0001-beta-includes-local-signer-fallback.md).
> **GitHub issue:** **#TBD** — open item (OQ-1); no plan until filled in.

## 1. Objective

Define the **authoriser-signing seam** — the one interface behind which the
managed signer (FS-1.3), the self-custody fallback (FS-1.6, ADR 0001), and
local development all sit — and ship a provider-free **dev signer** so local
flows can sign with no external service from day one (architecture §4.2:
the provider-free default is always present, [P8]; requirements §2.1).

## 2. Scope

### In (brief)

- **The `Signer` interface**: `requestAuthorisation(bundle) → { R, s, scheme }`
  — the bundle is operation metadata (account, circuit tag, args,
  `auth_nonce`); the returned signature is **public** data verified
  in-circuit (provider-integration §4.1).
- **A mock** for kernel/pipeline tests (consumed by FS-0.3).
- **The dev signer**: an in-memory, per-account **JubJub Schnorr** test key —
  the scheme verified in-circuit today (provider-integration §4.1; C5).
- **The private `packages/dev` workspace package** (`"private": true`, never
  published) — created here, home to all seam dev backends and mocks
  (ADR 0002).
- **A shared seam-conformance test** every `Signer` implementation must pass
  (mock, dev, and later FS-1.3/FS-1.6).

### Out

- The managed adapter (FS-1.3) and the passkey self-custody adapter
  (FS-1.6); provider policy, recovery, and presence gating.
- Challenge construction — the SHA-256 challenge definition is FS-1.1's
  (M1 brief); the seam signs the bundle it is handed.
- The §2.3 external-identity binding; FROST (post-beta,
  provider-integration §4.1).

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | The seam is **adapter-neutral**: one interface for managed, self-custody, and dev signers — nothing key-shaped crosses it, only the bundle in and the public `{R, s, scheme}` out. | The one-line signer swap is the architecture's promise and ADR 0001's contingency mechanism; the authoriser never sees the witness. | architecture §4.6 ex. 1; provider-integration §1, §4.1; ADR 0001 |
| D-2 | The dev signer uses **JubJub Schnorr** with an in-memory per-account key. | The only in-circuit-verified scheme today; per-account keys mirror the MIP's no-HD-tree rule. | provider-integration §4.1 |
| D-3 | Dev backends live in **`packages/dev`**, private, never published. | Dev-grade code must be un-shippable by construction. | ADR 0002 |
| D-4 | `scheme` is carried explicitly (`'jubjub-schnorr' \| 'ecdsa-secp256k1'`). | secp256k1 lands later; consumers must not assume the curve. | provider-integration §4.1 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── @midnight-ntwrk/mn-passport-core ──
export interface AuthorisationBundle {
  account: AccAddress;
  circuit: CircuitTag;
  args: readonly unknown[];
  authNonce: bigint;
}
export interface AuthorisationSignature {
  R: Uint8Array; s: Uint8Array;
  scheme: 'jubjub-schnorr' | 'ecdsa-secp256k1';
}
export interface Signer {
  requestAuthorisation(bundle: AuthorisationBundle): Promise<AuthorisationSignature>;
}

// ── packages/dev (private) ──
export function devSigner(opts?: { seed?: Uint8Array }): Signer & { publicKey: Uint8Array };
export function mockSigner(canned?: AuthorisationSignature): Signer;
```

## 5. Flow

Per provider-integration §3, the signer is touched **once** per operation:
the kernel builds the bundle → `requestAuthorisation` → the signature returns
as public call data for the preimage. The dev signer answers locally and
synchronously (wrapped in the async seam); no provider, no network. For local
end-to-end work the dev key is registered as an authoriser on the prototype
ACC so its signatures verify in-circuit on devnet (OQ-2 tracks the scheme
match with the prototype's interim seam).

## 6. Dependencies

**Internal:** FS-0.1. FS-0.2 only at verify time (circuit tags for a realistic
bundle). Downstream: FS-0.3 consumes the mock; FS-1.3 and FS-1.6 implement
this interface; FS-1.1 supplies the real challenge semantics.

**External gate:** none — that is the point of the dev signer.

## 7. Acceptance criteria

1. Mock and dev signer both satisfy the seam and pass the shared conformance
   test.
2. A dev-signer signature **verifies** — `s·G == R + c·pk` against the
   exposed test public key — in a unit test.
3. Two dev signers with different seeds produce independent keys (per-account
   independence, D-2).
4. `packages/dev` exists, is `"private": true`, and no publishable package
   depends on it (extends the FS-0.1 dependency-rule test).

## 8. Verify plan

- The Schnorr verification test (criterion 2) via `midnight-cq`.
- The conformance suite run against mock and dev implementations.
- The dependency-rule mutation check: point `core` at `packages/dev` and
  confirm the boundary test fails; revert.
- **Mocks:** none needed beyond the deliverables themselves; no external
  gate. In-circuit verification on devnet is validated later (FS-0.5/0.6 e2e
  and FS-1.1), not here.

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Interface + mock | seam types in `core`, mock, conformance test skeleton | ~5 files, ≤ 200 net lines |
| T2 | Dev signer + `packages/dev` | the private package, JubJub Schnorr dev key, verification test, dep-rule extension | ~7 files, ≤ 300 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Ceremony gate (§2.2) | Not weakened — the gate is kernel-side (FS-0.3), upstream of this seam; the dev signer has no presence gate and is confined to `packages/dev` (D-3). |
| Encrypt preimage to enclave (§2.5) | Untouched — the signer sees the bundle, never a preimage or witness (D-1). |
| Deposit, not address (§3.12) | Not touched. |
| `connect` never links `core` (§4.4) | Preserved; `packages/dev` is additionally barred from publishable dependents (criterion 4). |
| Two version axes (§4.6) | Not touched. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run). | Human |
| OQ-2 | **Dev scheme vs the prototype ACC** (brief) — the prototype's auth seam is the interim hash-preimage (architecture §7); the dev signer is Schnorr (D-2). Does the prototype artefact FS-0.2 pins verify Schnorr (C5), or does the dev signer need an interim hash-preimage mode until it does? | Track with FS-0.2 OQ-3/OQ-4; `doc-sync` on the answer |
| OQ-3 | **Where the dev key registers** — the exact devnet flow for adding the dev public key as an ACC authoriser before FS-1.1 exists. | Resolve at T2 with FS-0.2's fixtures |
