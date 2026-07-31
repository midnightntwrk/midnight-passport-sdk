# 0002 — M0 splits the seams into per-seam specs with local-dev defaults

Date: 2026/07/29 · Status: accepted
Refs: midnightntwrk/passport#TBD

## Context

The original M0 brief bundled all five seam interfaces (Signer, Prover,
Settlement, Storage, Platform) **and** the kernel + command/state skeleton
into one feature spec (FS-0.3). Review of the authored spec showed two
problems:

1. **Too big.** Five interfaces, a kernel skeleton, a command pipeline, and a
   mock adapter set is several reviewable concerns, not one — the spec was
   already straining the tranche budget at the proposal stage.
2. **No local-development story.** Mocks alone leave every seam un-runnable
   until M1's provider adapters land. The architecture already requires a
   provider-free default per seam (architecture §4.2, promise [P8]) and the
   requirements make the provider-free path a MUST at every release
   (requirements §2.1) — M0 is where that default should first exist, wired
   to the local environment the `devenv` skill already gates (devnet, local
   proof server, Compact CLI, HTTPS-local).

## Decision

Re-slice M0 (human decision, 2026/07/29):

- **FS-0.3** shrinks to the **kernel + command/state skeleton** and the
  composition point (`Passport.create`).
- **FS-0.4–FS-0.8** are one spec per seam — Signer, Prover, Settlement,
  Storage, Platform — each delivering three things: the **interface** (in
  `core`), a **mock**, and a **provider-free dev backend** wired to the local
  environment:
  - *Signer (FS-0.4):* an in-memory dev authoriser key — no provider.
  - *Prover (FS-0.5):* a client for the **local proof server** (loopback
    only, dev-grade posture).
  - *Settlement (FS-0.6):* simple local settlement — balance with user-held
    DUST from a funded devnet account, submit to the local node, await
    finalisation.
  - *Storage (FS-0.7):* an in-memory / file-backed ciphertext store.
  - *Platform (FS-0.8):* a Node test shim plus the HTTPS-local secure-context
    posture.
- Dev backends and mocks live in a **private workspace package
  (`packages/dev`)**, `"private": true`, never published — created by the
  first seam spec that needs it (FS-0.4).

## Consequences

- **M0's "no feature logic" note is qualified:** M0 now includes dev-grade
  local backends per seam; still no product feature flows and still no
  external gate — everything runs against the local environment.
- **M1 adapters reuse, not duplicate:** FS-1.4 (`adapter-prover-remote`)
  extends the FS-0.5 proof-server client with enclave sealing and the remote
  endpoint; FS-1.5 is an alternative Settlement backend (sponsored) beside
  FS-0.6's local one; FS-1.3/FS-1.6 implement the FS-0.4 Signer seam.
- **M1 brief dependencies retargeted:** FS-1.3 and FS-1.6 → FS-0.4;
  FS-1.4 → FS-0.5; FS-1.5 → FS-0.6 (previously all → FS-0.3).
- The dev-cleartext proving mode is loopback-guarded and dev-only; the
  encrypt-preimage-to-enclave MUST (requirements §2.5) continues to govern
  every remote path (FS-0.5 records the guard; FS-1.4 implements sealing).
- Docs updated: `roadmap/milestones/M0-foundations.md` (re-sliced briefs),
  `roadmap/milestones/README.md` (index), `roadmap/roadmap.md` §2 (M0
  paragraph), and the affected specs under `roadmap/specs/`.
