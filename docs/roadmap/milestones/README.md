# Passport SDK — Milestone specs (Beta v1)

> **Status:** draft · 2026/07/29
> **Purpose:** break the beta [roadmap](../roadmap.md) into the **per-feature
> specs** that `mn-passport-skills-spec-driver` drives. One file per milestone
> (M0–M4); each lists its feature specs (`FS-x.y`) as **briefs**. An agent
> (`mn-passport-skills-spec-author`) expands a brief into a full spec derived
> from the backing docs, then hands it to `spec-driver` to plan into PR-sized
> tranches per [`development-workflow.md`](../../development-workflow.md).
> Full specs land in [`../specs/`](../specs/), one subfolder per milestone,
> one file per feature spec (e.g. `../specs/M0-Foundations/FS-0.1-….md`).

## How an agent uses this

1. Pick a feature spec (`FS-x.y`) from a milestone file.
2. `mn-passport-skills-spec-author` expands its brief into a full spec in
   [`../specs/`](../specs/), deriving detail from the **backing docs** it
   names (the big docs in [`../../`](../../) are the source of truth).
3. **Name its GitHub issue.** `spec-author` / `spec-driver` *stop and ask* if a
   spec has no issue, so the `#TBD` placeholders here must be filled first.
4. `spec-driver` turns it into gated tranches; `STATE.md` tracks progress; the
   review lenses and CI gate enforce.

## Feature-spec brief template

Each `FS-x.y` below carries: **Objective · In/Out of scope · Backing docs ·
Surface & key interfaces · Dependencies (internal + external gate) · Acceptance ·
Verify (what `mn-passport-skills-verify` drives) · Suggested tranches · Open
questions · Issue.** Interface sketches are indicative; the full spec finalises
them.

## Index

- **[M0 — Foundations](./M0-foundations.md):** FS-0.1 scaffolding & workflow, FS-0.2 ACC contract binding, FS-0.3 kernel & command/state skeleton, FS-0.4 Signer seam + dev signer, FS-0.5 Prover seam + local proof server, FS-0.6 Settlement seam + local settlement, FS-0.7 Storage seam + dev store, FS-0.8 Platform seam + HTTPS-local (per-seam split: ADR 0002).
- **[M1 — Managed onboarding](./M1-managed-onboarding.md):** FS-1.1 call construction, FS-1.2 onboarding flow, FS-1.3 signer-managed (Dynamic), FS-1.4 prover-remote (BCW), FS-1.5 settlement (BCW), FS-1.6 signer-local (contingency fallback, ADR 0001).
- **[M2 — Connect](./M2-connect.md):** FS-2.1 protocol wire types, FS-2.2 Sign-In-with-Passport + profile.
- **[M3 — Reference dApp](./M3-reference-dapp.md):** FS-3.1 marketing experience (off-chain).
- **[M4 — Hardening & demo](./M4-hardening.md):** FS-4.1 reduced-privacy disclosure, FS-4.2 hardening pass + demo.

## Shared conventions

- **Backing docs** (in [`../../`](../../)): `sdk-requirements.md`,
  `architecture.md`, `provider-integration.md`, `beta-scope.md`.
- **External gates:** **Dynamic** (authoriser signer + registered ACC key),
  **BCW** (TEE proving + DUST sponsorship), **contract team** (deployed ACC +
  name service C2). A gate blocks *integration*, not the SDK-side build — build
  against mocks and integrate when the gate is ready.
- **Normative MUSTs** every spec must respect (checked by
  `mn-passport-skills-conformance`): ceremony gate (requirements §2.2),
  encrypt-preimage-to-enclave (§2.5), deposit-not-address (§3.12), `connect`
  never links `core` (architecture §4.4), the two version axes (wire / binding,
  §4.6).
