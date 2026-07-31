# FS-0.8 — Platform seam & HTTPS-local dev posture

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.8
> (per-seam split: [ADR 0002](../../../adr/0002-m0-per-seam-specs-with-dev-defaults.md)).
> **Backing:** [`architecture.md`](../../../architecture.md) §4.4 (platform
> adapters) and §8.5, [`development-workflow.md`](../../../development-workflow.md)
> §2 (`devenv`), [`sdk-requirements.md`](../../../sdk-requirements.md) §2.2.
> **GitHub issue:** **#TBD** — open item (OQ-1); no plan until filled in.

## 1. Objective

Define the **platform seam** — the interface through which `core` reaches
network and ceremony primitives without ever touching a platform global — and
establish the **HTTPS-local dev posture** passkeys require (a plain-HTTP
`localhost` redirect will not do; development-workflow §2, `devenv`). The real
browser wiring is `adapter-browser`'s (roadmap §3, M0–M1); this spec fixes
the interface it fills and ships the Node test shim `core`'s own tests run on.

## 2. Scope

### In (brief)

- **The `Platform` interface**: network primitives (`fetch`-shaped request,
  WebSocket factory) and the **ceremony-primitive hooks** — the shape through
  which the kernel's ceremony gate (FS-0.3) asks the platform for a passkey
  PRF evaluation or a password-KDF fallback (requirements §2.2), without
  `core` knowing WebAuthn exists.
- **A Node test shim** satisfying the seam for `core`'s unit tests (canned
  PRF output, `undici`-or-stub networking).
- **The dev posture, documented and checked**: HTTPS-local secure context for
  any browser-facing work, asserted by the `devenv` doctor.

### Out

- **`adapter-browser`'s implementation** — real WebAuthn PRF, browser
  storage backends, Web Worker wiring (architecture §4.4; roadmap §3).
- **`adapter-node`** as a product target (out of beta; beta-scope §3) — the
  shim here is test scaffolding, not that adapter.
- The password-KDF implementation itself (kernel/M1 territory); i18n'd
  ceremony UX (UI layer).

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | `core` holds **no platform code** — no `fs`, `window`, `fetch`; everything platform-shaped enters through this seam. | The portability rule that keeps the kernel unit-testable; already lint-enforced by FS-0.1. | architecture §4.4 |
| D-2 | The ceremony gate stays **kernel-owned**; Platform exposes only the raw presence/derivation primitives (PRF evaluate, KDF input capture). Policy — when a ceremony is required — never delegates to the platform. | The gate is a MUST; an adapter must not be able to skip it. | requirements §2.2; architecture §4.1 |
| D-3 | The shim lives in **`packages/dev`**, private. | Test scaffolding must be un-shippable. | ADR 0002 |
| D-4 | HTTPS-local is the documented dev baseline for anything browser-facing, checked by `devenv`, from M0 — before any passkey code exists. | Passkeys require a secure context even locally; discovering that in M1 would stall the first real ceremony work. | development-workflow §2 (`devenv`) |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── @midnight-ntwrk/mn-passport-core ──
export interface Platform {
  fetch(input: PlatformRequest): Promise<PlatformResponse>;
  webSocket(url: string): PlatformSocket;
  ceremony: {
    prfEvaluate(salt: Uint8Array): Promise<Uint8Array>;   // passkey PRF (browser)
    kdfFromPassword(prompt: CeremonyPrompt): Promise<Uint8Array>; // fallback
    capabilities(): { prf: boolean };
  };
}

// ── packages/dev (private) ──
export function nodeTestPlatform(opts?: { prfSeed?: Uint8Array }): Platform;
```

## 5. Flow

At composition (`Passport.create`, FS-0.3) the platform arrives as a seam like
any other. When the kernel's ceremony gate needs presence + a derived key it
calls `ceremony.prfEvaluate` (or the KDF fallback where `capabilities().prf`
is false — the documented §2.2 fallback), and uses the result kernel-side; the
platform never sees what the derived key unlocks (D-2). Network primitives are
pass-through. Nothing external is involved; in the browser this seam is where
`adapter-browser` will connect WebAuthn, which is why the HTTPS-local posture
is established now (D-4).

## 6. Dependencies

**Internal:** FS-0.1. Downstream: FS-0.3's kernel consumes the ceremony hooks;
`adapter-browser` implements the seam; every dev backend that needs networking
(FS-0.5, FS-0.6) may ride the shim in tests.

**External gate:** none.

## 7. Acceptance criteria

1. `core` builds against `Platform` with the FS-0.1 boundary lint still
   green (no platform globals anywhere in `core`).
2. The Node shim satisfies the seam and its conformance test; `core`'s unit
   tests run on it, including a stub ceremony round-trip (PRF path and KDF
   fallback path both exercised).
3. `capabilities()` correctly gates the PRF-vs-KDF choice in a kernel test
   (the §2.2 fallback logic is observable).
4. The `devenv` doctor asserts the HTTPS-local secure context, and the dev
   posture is documented (README or a `docs/` note per doc conventions).
5. `packages/dev` remains un-linkable from publishable packages.

## 8. Verify plan

- The conformance + ceremony round-trip tests over the shim (`midnight-cq`).
- The boundary-lint mutation check: add a bare `fetch` call in `core`,
  confirm the lint fails, revert.
- A `devenv` doctor run confirming HTTPS-local (alongside its devnet / proof
  server / Compact CLI checks).
- **Mocks:** the shim *is* the stand-in — real WebAuthn PRF behaviour is
  `adapter-browser`'s to verify later; recorded plainly as deferred, and the
  PRF-hook shape flagged `[PROVISIONAL]` in the verify register until a real
  passkey exercises it.

## 9. Proposed tranches

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | Interface + shim | `Platform` types, Node test shim, conformance test | ~5 files, ≤ 250 net lines |
| T2 | Ceremony hooks + dev posture | PRF/KDF hook wiring into the kernel gate stub, capability gating test, HTTPS-local docs + doctor assertion | ~5 files, ≤ 250 net lines |

## 10. Respecting the normative MUSTs

| MUST | Status |
|---|---|
| Ceremony gate before witness use (§2.2) | **Actively shaped** — the gate stays kernel-owned; Platform exposes primitives only (D-2), and the PRF/KDF fallback logic becomes testable now. |
| Encrypt preimage to enclave (§2.5) | Not touched. |
| Deposit, not address (§3.12) | Not touched. |
| `connect` never links `core` (§4.4) | Preserved. |
| Two version axes (§4.6) | Not touched. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | **GitHub issue: #TBD** (dry run). | Human |
| OQ-2 | **The Platform ↔ ceremony-gate split** (brief; joint with FS-0.3 OQ-3) — the exact boundary between "the kernel decides a ceremony is due" and "the platform performs the gesture", especially for the managed path where the provider's passkey login is the presence gate (beta-scope §2 item 2). | Decide at T2 jointly with FS-0.3; `doc-sync` if architecture §4.2 needs a row |
| OQ-3 | **The PRF hook shape** (brief) — salt/domain-separation conventions for `prfEvaluate` so the browser adapter and the storage envelope agree later (architecture §4.5's derivation lever). | `[PROVISIONAL]` at T1; re-check when `adapter-browser` lands a real passkey |
| OQ-4 | **Where the HTTPS-local posture is documented** — README vs a `docs/` dev-environment note. | Decide at T2 (docs stay vendor-neutral either way) |
