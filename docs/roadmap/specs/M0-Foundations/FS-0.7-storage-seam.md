# FS-0.7 — Storage seam & dev store

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.7
> (per-seam split: [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`architecture.md`](../../../architecture.md) §4.5,
> [`sdk-requirements.md`](../../../sdk-requirements.md) §3.6.
> **GitHub issue:** **#TBD** — open item (OQ-1); no plan until filled in.

## 1. Objective

Define the **ciphertext-at-rest seam** — the storage interface whose type
admits no plaintext — and ship a **dev store** (in-memory, with a file-backed
option so local state survives restarts). The browser IndexedDB adapter, the
vendor keystore, and the shared #58 provider all implement this same seam
later; the seam's job now is to fix the ciphertext-only contract they must
honour (architecture §4.5).

## 2. Scope

### In (brief)

- **The `Storage` interface**: `get`/`put` over
  `{ version, nonce, ciphertext }` entries, keyed per account/context
  (architecture §4.5 step 2).
- **A mock** for FS-0.3's pipeline tests.
- **The dev store**: in-memory for unit tests; file-backed (JSON of
  base64 ciphertext entries) for persistence across local dev runs.
- **The shared seam-conformance test** (round-trip, missing-key, versioning).

### Out

- **Browser IndexedDB / OPFS** — rides `adapter-browser` (roadmap §3).
- **Vendor keystore** and the **shared #58 provider** (post-beta;
  beta-scope §4).
- **Key derivation and the envelope** — sealing/opening and the
  ceremony-derived wrapping key are the kernel's (architecture §4.1, §4.5;
  FS-0.3). This seam stores what it is given.
- Backup-tier logic (regenerable/irreplaceable classification, durable-backup
  preconditions — architecture §4.5 steps 1 and 3) — arrives with real
  private state, post-M0.

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | The seam stores **ciphertext only**, by type: `{ version, nonce, ciphertext }` — no field can carry plaintext. | Device theft or a store read yields ciphertext only; the wrapping key never reaches the storage layer. | architecture §4.5 step 2 |
| D-2 | Entries are **keyed per account/context**. | Multi-account isolation from day one; matches the documented local-store model. | architecture §4.5 step 2 |
| D-3 | Plaintext/key handling stays **kernel-side** (the envelope); adapters see sealed entries only. | The kernel is the secret boundary. | architecture §4.1 |
| D-4 | The dev store lives in **`packages/dev`**, private; the file-backed variant is dev-convenience, not a durability story. | Durability tiers and mandatory backup are a real feature (architecture §4.5 step 3), not a dev shortcut. | ADR 0002; architecture §4.5 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── @midnight-ntwrk/mn-passport-core ──
export interface StorageKey { account: AccAddress; context: string }
export interface CiphertextEntry { version: number; nonce: Uint8Array; ciphertext: Uint8Array }
export interface Storage {
  get(key: StorageKey): Promise<CiphertextEntry | null>;
  put(key: StorageKey, entry: CiphertextEntry): Promise<void>;
}

// ── packages/dev (private) ──
export function memoryStorage(): Storage;
export function fileStorage(opts: { path: string }): Storage;
export function mockStorage(): Storage;
```

## 5. Flow

The kernel seals private state into a `CiphertextEntry` (envelope, FS-0.3 —
stubbed for now) and `put`s it under its account/context key; on read it
`get`s and opens under the ceremony-derived key. In M0 the entries flowing
through are test fixtures — the point is that every adapter written later
(browser, vendor, #58) faces an interface that never lets plaintext through.
No external party is involved.

## 6. Dependencies

**Internal:** FS-0.1. Downstream: FS-0.3 consumes the mock; `adapter-browser`
(M0–M1) and the post-beta storage adapters implement the seam.

**External gate:** none.

## 7. Acceptance criteria

1. Mock, memory, and file stores satisfy the seam and pass the conformance
   test (round-trip fidelity, `null` on missing key, entry versioning).
2. The file store persists across process restarts and stores nothing but
   the entry fields (inspectable: the file contains no plaintext-shaped
   field).
3. Keys isolate: entries under different accounts/contexts never collide.
4. `packages/dev` remains un-linkable from publishable packages.

## 8. Verify plan

- The conformance suite over all three backends (`midnight-cq`).
- The restart-persistence test for the file store.
- **Mocks:** none needed; no external gate. Browser-engine durability
  questions (eviction, `persist()`) belong to `adapter-browser` and
  architecture §8.5's open verification — noted, not owned here.

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Interface + mock | seam types, mock, conformance test | ~4 files, ≤ 150 net lines |
| T2 | Dev store + tests | memory + file backends, persistence and isolation tests | ~4 files, ≤ 200 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Ceremony gate (§2.2) | **Supported structurally** — decryption cannot happen in this layer at all; only the kernel (behind the gate) holds keys (D-1, D-3). |
| Encrypt preimage to enclave (§2.5) | Not touched. |
| Deposit, not address (§3.12) | Not touched. |
| `connect` never links `core` (§4.4) | Preserved. |
| Two version axes (§4.6) | Not touched. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run). | Human |
| OQ-2 | **Keying granularity** (brief) — is `context` per dApp, per state-tier, or both (architecture §4.5's tier table suggests tier-aware handling later)? *Lean:* opaque string now, tier semantics when backup lands. | Decide at T1; revisit with the backup feature |
| OQ-3 | **Entry versioning semantics** — `version` is per-entry in §4.5; whether recovery-epoch rotation ([C14]) bumps it or wraps it is a post-M0 recovery question. | Defer to the recovery spec; note in code |
