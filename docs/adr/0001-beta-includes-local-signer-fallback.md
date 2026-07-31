# 0001 — Beta includes `adapter-signer-local` as a contingency fallback

Date: 2026/07/29 · Status: accepted
Refs: midnightntwrk/passport#TBD

## Context

Beta scope (2026/07/24 draft) was deliberately **managed path only**: account
setup and use through the wallet-infrastructure provider, with the
decentralised self-custody path (in-circuit Jubjub device keys, requirements
§2.1 decentralised / §2.3) entirely out of beta. That made the provider's
authoriser-signer integration a hard external gate on beta onboarding as a
whole (roadmap §4): if the provider was not ready, beta had no signing path
at all.

On 2026/07/29 the human decision was taken that this risk is not acceptable:
the provider integration may not be ready in time, and beta must not be
single-pointed on it.

## Decision

Beta **builds `adapter-signer-local`** — the self-custody signer adapter
(architecture §4.4) — alongside `adapter-signer-managed`, behind the same
signer seam, as a **contingency fallback**:

- The **managed path remains the primary** beta experience; the fallback is
  promoted to the beta onboarding path only if the provider's signer gate
  slips past an activation checkpoint (beta-scope §5, open question — the
  checkpoint date/milestone is still to be set).
- The seam substitutability the architecture already promises (§4.6 example 1:
  a one-line signer swap, same flow, same ACC; [P8]) is what makes this cheap:
  no flow or kernel change, one additional adapter package.
- What stays deferred is the decentralised path **as the default** and
  progressive decentralisation generally — not the fallback adapter itself.

Docs updated: `beta-scope.md` §2 item 2, §3, §4, §5 (status 2026/07/29);
`roadmap/roadmap.md` §1, §3, §4, §8 (status 2026/07/29).

## Consequences

- **M1 grows one adapter.** `adapter-signer-local` is built in M1 alongside
  the managed signer (roadmap §3); its skeleton joins FS-0.1's scaffolding
  set, and its seam is FS-0.3's Signer interface unchanged.
- **The provider signer gate is downgraded** from blocking beta onboarding to
  blocking only the managed-path integration (roadmap §4).
- **An activation checkpoint must be set** — the date/milestone at which
  provider readiness is assessed (beta-scope §5); tracked in the verify
  register until closed.
- **Interim-signer question inherited:** requirements §2.3 has the in-circuit
  Jubjub Schnorr signer landing behind an interim hash-preimage signer;
  which of the two the fallback ships at beta follows §2.3, decided in the
  M1 spec for the adapter.
- The reduced-privacy disclosure posture (requirements §2.5) is unaffected —
  proving stays remote on both signer paths in beta.
