---
name: conformance
description: Design-conformance review lens for Midnight Passport SDK changes — checks code against docs/sdk-requirements.md and docs/architecture.md, and against the planning workspace (the passport repo: component canvases, promises, and recorded decisions). Covers package dependency rules, kernel secret boundary, normative MUSTs, naming, and version axes. Use after implementing a tranche, at plan time for alignment, or whenever asked to check a change against the design.
---

# conformance — the design guard

Checks a change against the source of truth: `docs/sdk-requirements.md`
(§ references below) and `docs/architecture.md` (arch §). Those SDK docs are
themselves **derived from the Midnight Passport planning workspace**, so the
change is also checked against that upstream — see §5. **The docs win over
this checklist** — it is derived from them (as of 2026/07/28); if they have
moved, re-derive from the docs and update this skill via `mn-passport-skills:doc-sync`.

Run over the tranche's diff, not the whole repo. Classify every finding as
**blocking** (violates a rule below → fix before `pr-open`), **advisory**, or
**divergence** (the code is right and the doc is wrong → route to
`mn-passport-skills:doc-sync`; never bend correct code to a stale doc).

## 1. Package and dependency rules (arch §4.4)

- Dependencies point **inward** to `mn-passport-core`'s interfaces; nothing
  points outward.
- `mn-passport-connect` links **only** `mn-passport-protocol` and
  `mn-passport-contract` — never `core` or any adapter. Deposits (§3.12) ride
  `contract`, which is why `contract` is permitted there.
- `mn-passport-core` holds **no platform code** (`fs`, `window`, `fetch`,
  `WebSocket`) and **no concrete provider** — seam interfaces only.
- `mn-passport-protocol` is types + constants only — **zero runtime logic**.
- Adapters (`mn-passport-adapter-*`) depend only on the seam interface they
  implement plus their own provider SDK. The provider-free default for each
  seam always ships (§2.1, [P8]).
- Naming: packages under `@midnight-ntwrk/`, prefixed `mn-passport-`.
- The SDK never owns or compiles the ACC contract — it consumes the
  versioned published artefact via `mn-passport-contract` (arch §8.2), which
  owns the connect-time version guard.

## 2. Kernel secret boundary (arch §4.1, §5)

- Only the kernel ever holds decrypted secrets. Secrets leave it **only** as:
  (a) an in-circuit witness to a local prover, (b) an enclave-encrypted
  preimage to a remote prover, or (c) ciphertext to storage/sync. Never
  plaintext to an adapter, dApp, or agent.
- Witness decryption happens only under the §2.2 ceremony; decrypted material
  is ephemeral and **zeroised after proving** ([C7]).
- Adapters receive scoped handles, never key material.
- An agent holds a policy-gated **grant authoriser** — never the device or
  account key (§3.8).

## 3. Normative MUSTs (requirements doc)

- **§2.1** — the provider-free path stays viable at every release;
  progressive decentralisation (managed → decentralised authoriser swap) is
  an exposed, supported flow.
- **§2.2** — every transaction confirmation requires a passkey/password
  ceremony; per-dApp private state is encrypted at rest; the sole exception
  to per-transaction ceremony is the agent path's policy-gated grants (§3.8).
- **§2.3 / §3.7** — one signing primitive (Schnorr-on-Jubjub); external
  identities (ECDSA, Ed25519, secp256k1) attach via the one-time signed
  binding, committed as a typed ACC device entry; no second key hierarchy for
  DIDs.
- **§2.5** — the proving preimage is **encrypted to the prover's enclave key
  before it leaves the device** (both remote variants); the SDK does **not**
  perform enclave attestation (delegated upstream — an accepted, registered
  risk); the in-tab → remote fallback is **consent-gated, never silent**,
  with a standing reminder while remote proving is active; proof provenance
  (where proved, who submitted) is surfaced truthfully as a first-class
  event; the k-threshold is measured and configurable, not a constant.
- **§3.6** — only non-reconstructable secrets sync; the blob is sealed under
  the ceremony envelope before leaving the device; the vendor keystore is one
  adapter behind the storage/sync seam, not the mechanism; sync is not
  recovery.
- **§3.9** — Passport-supplied witness provisioning is scoped, consented,
  and ceremony-gated, per dApp — never blanket profile access.
- **§3.12** — funding an account is a **deposit contract call**; UIs and
  integrations never present the raw ACC address as a payment address.
- **Arch §4.5** — the irreplaceable state tier requires a confirmed durable
  backup before the user accrues such state; local stores hold ciphertext
  only (`{version, nonce, ciphertext}`).

## 4. Structure and state

- Approach 2 with Approach-3-shaped seams (arch §3): imperative flows over a
  real kernel boundary; seam interfaces already adapter-shaped.
- **Two version axes, never conflated** (arch §4.6): wire
  (`PROTOCOL_VERSION`, dApp ↔ wallet) vs binding (`mn-passport-contract` ↔
  deployed ACC range, arch §8.2).
- No module-global singletons; instance-scoped and disposable; observable
  reads, imperative writes through the pipeline (arch §4.3, §7).

## 5. Planning-workspace conformance (the `passport` repo)

The SDK docs are **derived from** the Midnight Passport planning workspace,
where the component canvases (`[C1]`–`[C26]`), promises (`[P…]`), decision
records, and MIPs are maintained. Check the change and its spec against that
upstream too:

- **Resolve the workspace** at `../passport` (a sibling checkout); if it is not
  present locally, use the public repository
  `github.com/midnightntwrk/passport` — `docs/plans/components/` for the
  canvases, `docs/mps-mip/` for the MIPs.
- Every `[C…]` / `[P…]` a change or spec cites must match the **current**
  canvas: the component's chosen alternative and its decided status (e.g. C1
  and C5 fix Schnorr-on-Jubjub verified in-circuit; C4 the custody model; C2
  the name service). A change that contradicts a **decided** canvas is
  **blocking**.
- Where an SDK-doc reference and the upstream canvas disagree, the **upstream
  canvas wins**: treat it as a **divergence** → `mn-passport-skills:doc-sync` (fix the
  SDK doc, record an ADR), never silently follow a stale SDK doc.
- **Read-only.** Conformance never edits the `passport` repo; it is maintained
  upstream (like `docs/reference/` and the nearfall subtree).

## Output

A findings list grouped blocking / advisory / divergence, each with file
reference and the doc section it violates. At plan time, run the same rules
as an advisory alignment pass over the proposed tranches.
