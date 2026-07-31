# FS-0.6 — Settlement seam & simple local settlement

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.6
> (per-seam split: [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`provider-integration.md`](../../../provider-integration.md)
> §5.2–§5.3, [`architecture.md`](../../../architecture.md) §4.2 (fee seam),
> [`beta-scope.md`](../../../beta-scope.md) §2 item 3.
> **GitHub issue:** **#TBD** — open item (OQ-1); no plan until filled in.

## 1. Objective

Define the **settlement seam** — balance, fee-pay, bind, submit, await
finalisation — and ship **simple local settlement**: a dev backend that
balances with **user-held DUST from a funded devnet account** and submits via
the local node. This is the fee seam's provider-free default made real
(architecture §4.2: user-held DUST is the default; [P8]); the sponsored
backend via the proving & settlement service is FS-1.5, an alternative
implementation of this same seam (ADR 0002).

## 2. Scope

### In (brief)

- **The `Settlement` interface**: `balanceAndSubmit(unsealedTx) → txId` and
  `awaitFinalised(txId)` — covering the §5.2 balancing obligations (balance
  in-intent, pay fees, bind, seal) and the §5.3 relay, as one seam.
- **A mock** for FS-0.3's pipeline tests.
- **The dev settlement backend** ("simple local settlement"): balance the
  unsealed tx with DUST from a funded devnet dev account, bind, submit via
  the local node, and watch finalisation via the local indexer.
- **A local e2e test**: the proof FS-0.5 produces locally becomes a balanced,
  submitted, finalised transaction on devnet.

### Out

- **Sponsored settlement** — fee sponsorship, `payFees`, and the service
  integration are FS-1.5 (provider-integration §5.2; beta-scope §2 item 3).
- **The Capacity Exchange** fee path (post-beta; beta-scope §4).
- Fee estimation UX, retry policy for congested devnets, and multi-intent
  composition — M1+ concerns.

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | Settlement is **one seam covering balance + bind + submit + finalisation**, distinct from authorisation. | Ledger-level fee/coin settlement is a different concern (and, in beta, a different party) from the in-circuit signature. | provider-integration §5.2–§5.3 |
| D-2 | The dev backend settles with **user-held DUST** from a funded devnet account. | User-held DUST is the fee seam's provider-free default; on devnet, funding an account is trivial and needs no sponsor. | architecture §4.2 (fee seam); requirements §2.1 / [P8] |
| D-3 | `awaitFinalised` is part of the seam, watching the indexer. | The device awaits finalisation in the canonical sequence; every backend must answer it. | provider-integration §2 (device duties), §3 step 14 |
| D-4 | The dev backend lives in **`packages/dev`**, private. | Dev-grade code must be un-shippable. | ADR 0002 |
| D-5 | The unsealed-tx type is owned by the kernel/pipeline (FS-0.3), not this seam — settlement consumes it opaquely. | Keeps the seam thin and the tx-assembly logic in one place. | architecture §4.1, §4.3 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── @midnight-ntwrk/mn-passport-core ──
export interface Settlement {
  balanceAndSubmit(unsealedTx: UnsealedTx): Promise<TxId>;
  awaitFinalised(txId: TxId): Promise<void>;
}

// ── packages/dev (private) ──
export function devnetSettlement(opts: {
  nodeUrl: string;
  indexerUrl: string;
  feeAccount: DevFeeAccount;      // the funded devnet account (user-held DUST)
}): Settlement;
export function mockSettlement(): Settlement;   // instant txId + finalisation
```

## 5. Flow

Local development mirrors provider-integration §3 steps 9–14 with the dev
account in the service's place: the pipeline hands over the unsealed tx
(proof present, unbalanced) → the dev backend adds coin inputs/outputs from
the funded account to remove imbalances, pays the DUST fee itself, binds, and
submits to the local node → `awaitFinalised` resolves via the local indexer.
The pipeline's `submitted` event carries `by: 'passport'` here (the dev
backend submits directly); the sponsored backend (FS-1.5) is where
`by: 'service'` appears.

## 6. Dependencies

**Internal:** FS-0.1; FS-0.5 (the locally proven tx the e2e settles); FS-0.3's
pipeline for the full local run. Downstream: FS-1.5 implements the sponsored
backend; FS-1.2's flow uses whichever backend is injected.

**External gate:** none. Devnet node + indexer are local
(`mn-passport-skills:devenv`); the dev account is funded by devnet tooling.

## 7. Acceptance criteria

1. Mock and dev backend satisfy the seam and its conformance test.
2. **The local e2e lands on devnet** — a tx proven by FS-0.5's dev prover is
   balanced with the dev account's DUST, submitted, and `awaitFinalised`
   resolves; the tx is visible via the indexer.
3. A deliberately unfundable balance (dev account drained) fails loudly with
   a typed error, not a hang.
4. `packages/dev` remains un-linkable from publishable packages.

## 8. Verify plan

- **The devnet e2e** (criterion 2) via `sdk-tester` on the local devnet —
  this spec's "does it run", and jointly with FS-0.5 it closes M0's "a stub
  wiring compiles end-to-end" into "a dev wiring *runs* end-to-end".
- The drained-account failure test (criterion 3).
- **Mocks:** none — node, indexer, and DUST are all real-but-local. The
  sponsored posture is FS-1.5's to verify, recorded as out of scope here.

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Interface + mock | seam types, mock, conformance test | ~4 files, ≤ 150 net lines |
| T2 | Dev balance + submit | devnet backend: balancing with user-held DUST, bind, submit | ~5 files, ≤ 300 net lines |
| T3 | Finalisation + local e2e | indexer watch, `awaitFinalised`, the FS-0.5 → FS-0.6 e2e test | ~4 files, ≤ 250 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Ceremony gate (§2.2) | Upstream (kernel); settlement handles a proven tx, never a witness. |
| Encrypt preimage to enclave (§2.5) | Not touched — proving is FS-0.5/FS-1.4; this seam starts after the proof exists. |
| Deposit, not address (§3.12) | Not touched — no deposit surface exists; the dev backend balances fees, it does not pay accounts. |
| `connect` never links `core` (§4.4) | Preserved. |
| Two version axes (§4.6) | Not touched. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run). | Human |
| OQ-2 | **The midnight-js balancing API** for user-held DUST (brief) — which upstream calls implement balance-in-intent + bind for a locally held account, and their exact pinned versions (7-day cooldown applies). | Resolve at T2; `mn-passport-skills:deps` for the pins |
| OQ-3 | **Indexer placement** (brief; inherited from the old FS-0.3's OQ-4) — `awaitFinalised` watches the indexer from inside Settlement (D-3), but architecture §4.2 lists indexer as its own seam and M1's FS-1.1 needs `auth_nonce` reads. Does a read-side indexer seam appear in M1, or does the brief's five-seam set stand? | `mn-passport-skills:doc-sync` — brief and architecture §4.2 should agree before M1 planning |
| OQ-4 | **Dev-account funding** — the devnet faucet/genesis mechanism `devenv` should provision, and how the e2e obtains it deterministically. | Resolve at T2 with `devenv` |
