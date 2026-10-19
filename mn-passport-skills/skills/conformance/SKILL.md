---
name: conformance
description: Design-conformance review lens for Midnight Passport SDK changes — checks code against docs/sdk-requirements.md and docs/architecture.md, and against the planning workspace (the passport repo: component canvases, promises, and recorded decisions). Covers package dependency rules, kernel secret boundary, normative MUSTs, naming, and version axes. Use after implementing a tranche, at plan time for alignment, or whenever asked to check a change against the design.
---

# conformance — the design guard

Checks a change against the source of truth: `docs/sdk-requirements.md`
(cited as "requirements" with the section name, or "rule N" for its
"Normative rules" table) and `docs/architecture.md` (cited as "architecture"
with the section name). Those SDK docs are themselves **derived from the
Midnight Passport planning workspace**, so the change is also checked against
that upstream — see §5. **The docs win over this checklist** — it is derived
from them (as of 2026/10/19); if they have moved, re-derive from the docs and
update this skill via `mn-passport-skills:doc-sync`.

Run over the tranche's diff, not the whole repo. Classify every finding as
**blocking** (violates a rule below → fix before `pr-open`), **advisory**, or
**divergence** (the code is right and the doc is wrong → route to
`mn-passport-skills:doc-sync`; never bend correct code to a stale doc). Never
flag what the docs do not require: a missing per-call ceremony, a missing
enclave encryption before a trusted-hardware prover exists, or a signing arm
other than JubJub are **not** findings.

## 1. Package and dependency rules (architecture, "Dependency rules")

- An entry library (`core`, `connect`, `mn-passport-agent`) depends on the
  foundation; the foundation never depends on an entry library.
- `mn-passport-account` depends only on `mn-passport-contract` and
  `mn-passport-protocol`; those two depend on no other SDK package.
- **`connect` and `mn-passport-agent` never link `core`** or a Passport-app
  adapter, not even transitively. Shared code goes into `mn-passport-account`.
- `mn-passport-ecosystems` depends only on `mn-passport-protocol`.
- A shared adapter depends on the package that defines its seam and on its own
  provider SDK — never on `core` or another adapter. A Passport-app adapter
  (`adapter-storage-wpp`, `adapter-recovery`, `adapter-did`) implements a seam
  from `core`, and only `core` uses it. `adapter-waas` is used only by `core`.
- `core` and the foundation hold **no platform code** (`fs`, `window`,
  `fetch`); the platform adapters supply it.
- The SDK never compiles or owns the ACC; it consumes the published artifact.
- `scripts/dependency-graph.mjs` is the graph; `scripts/lint-boundaries.mjs`
  (imports) and `tests/dependency-rules.test.mjs` (manifests and project
  references) enforce it. A new package enters the graph deliberately, in the
  same PR.
- Naming: packages under `@midnight-ntwrk/`, prefixed `mn-passport-`.

## 2. Kernel secret boundary (architecture, "The core kernel invariant")

- Only the kernel in `core` holds in plaintext: the PRF output and the JubJub
  device key derived from it; the WPP account key and the package keys; the
  viewing key. It derives the device key and the WPP account key for one
  operation only.
- Only the items in "What leaves the kernel" leave it: a signature over an ACC
  challenge; the unproven transaction to the V1 prover (with the disclosure);
  one WPP package key to its dApp at the handoff, after a tap and a separate
  consent; ciphertext to WPP storage; the ACC address, with the viewing key and
  the WPP account key only as ciphertext, in the metadata of an isolated WaaS
  backup key.
- The viewing key leaves whole only to the holder of a read grant, after a
  separate consent, under the read-access lifecycle (rule 13).
- On the p256 arm, the device key stays in the authenticator.
- A dApp or an agent holds only its own grant key. It never holds or drives a
  device key or an owner key (rules 9 to 11).

## 3. Normative rules (requirements, "Normative rules")

Check each rule the change touches:

1. **Ceremony gate** — a passkey tap at grant issuance and at the handoff; no
   tap per call, except for a grant key that is a passkey on the dApp origin.
   Each passkey signature in the Passport app needs a tap.
2. **Prover disclosure** — the V1 prover sees the private inputs of each proof,
   for the ACC and for each dApp circuit; the user is told. Enclave encryption
   becomes mandatory once a trusted-hardware prover exists.
3. **Deposit, not address** — a payment to an account is a deposit call; UIs
   never present the raw ACC address as a payment address.
4. **No `core` in `connect` or `mn-passport-agent`** (§1 above).
5. **Two version axes** (§4 below).
6. **A full shielded address**, both halves from one parsed address.
7. **The recipient key at the time of the seal**, and again for each retry.
8. **Write-back after `SucceedEntirely`** on each submit path.
9. **Independent operation** — after the grant and the handoff, a dApp or an
   agent signs with its own grant key, with Passport closed.
10. **One grantee key** for each account and each origin.
11. **No onboarding in a dApp** — only the Passport app adds an owner key.
12. **The WaaS key only as an isolated backup owner key**, with protected,
    authenticated, and current metadata (provider-integration, "The WaaS
    provider").
13. **The read-access lifecycle** — rotate before share, re-seal or mark after
    each rotation, rotate on revocation.
14. **No user-held DUST** on any SDK path.

**Signing arms.** The ACC verifies four arms: k256 envelope 0, k256 envelope
1, p256, and JubJub (requirements, "Signing digests"). A key on any arm is
valid; check that the change builds the exact digest of its arm and builds
each challenge from the arguments of the circuit.

## 4. Structure and state

- Approach 2 with seams that already have the approach 3 shape (architecture,
  "Design approach"): observable reads, imperative writes.
- **Two version axes, never conflated** (rule 5): wire (`PROTOCOL_VERSION` in
  `mn-passport-protocol`) vs binding (`mn-passport-contract` ↔ the deployed
  ACC). The matrix lives in `docs/compatibility.md`.

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
  canvas: the component's chosen alternative and its decided status (e.g. C4
  the custody model; C2 the name service). A change that contradicts a **decided** canvas is
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
