# FS-2.4 — Authorising additional keys (platforms and providers)

> **Status:** draft · 2026/08/24 · authored per `mn-passport-skills:spec-author` conventions
> **Supersedes:** the candidate-registry shape drafted earlier the same day —
> the on-chain candidates store, cap, expiry, and new circuits are all
> removed; the proposal now travels out-of-band and only the grant touches
> the chain.
> **Milestone:** M2 — Connect ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M2-connect.md`](../../milestones/M2-connect.md) § FS-2.4.
> **Backing:** [`onboarding-and-key-authorisation.md`](../../../onboarding-and-key-authorisation.md) §6
> (the design), [`sdk-requirements.md`](../../../sdk-requirements.md) §3.5
> (the out-of-band handoff rule) and §3.13,
> [`architecture.md`](../../../architecture.md) §4.4.
> **GitHub issue:** **midnightntwrk/passport#77** (C27 · Passport Facade) —
> a dedicated SDK issue should replace it before spec-driver plans (OQ-1).

## 1. Objective

Let an existing Passport user join a **new external platform** — a
Passport-embedding environment or a managed provider needing its own
authoriser key for the user; never a dApp, which integrates through the
connector (§3.9) and holds no account key — when the existing credential
cannot follow them. The platform generates its key per the §2.3 signing
requirements and **exposes the public key out-of-band, preferably as a QR
code**; the **Passport PWA scans it** and, under the §2.2 ceremony with an
existing authorised key, **grants the key as an authoriser on the ACC**
through the existing add-authoriser circuit. The proposal never touches the
chain; the PWA is the only party that receives the key and the only party
that signs the grant.

## 2. Scope

### In

- **`mn-passport-protocol`**: the **authoriser-request payload** — versioned
  types: `{ v, scheme, publicKey (or commitment), label? }`. Types and
  constants only; the pure codec (encode/decode, QR/string form) lives in
  `core`, like the largeBlob codec.
- **The `onboard` facade (platform side)**: `createAuthoriserRequest` —
  generates the key following the Passport signing requirements (§2.3;
  for a managed provider that is its **P-256 secure-signer key** — providers
  never use passkey/PRF),
  returns the payload and its display encoding (QR content / copyable
  string for the same-device case); `awaitGrant` — detects the grant
  landing by watching for the public key in the account's authoriser set
  (the same indexer lookup as the §4 blob-miss fallback).
- **`core` devices flow (PWA side)**: `grantAuthoriser(payload)` —
  ceremony-gated, `require_device`; decodes the payload, exposes the key
  fingerprint and label to the approval UI, and submits the existing
  add-authoriser call with the scanned public key as the typed entry
  (§2.3 binding semantics).

### Out

- **Any ACC contract change — none is needed.** The existing
  add-authoriser circuit is the whole on-chain surface; no candidate
  storage, no cap, no expiry, no new circuits. (This is the decisive
  advantage over the superseded candidate-registry shape.)
- QR rendering and scanning UI (the PWA's surface; this spec ships the
  flows and payload it uses).
- Recovery interactions (C13–C15), grant issuance, agent principals.

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | **The proposal travels out-of-band; only the grant touches the chain.** The platform exposes its public key (QR primary; copyable string / deep link for the same-device case); nothing unauthorised ever writes to the ACC. | A public key is public data — it needs no on-chain registry; removing the registry removes the spam surface, the cap policy, and the contract-team gate entirely. | onboarding-and-key-authorisation.md §6 |
| D-2 | **The PWA is the sole granting party**: `grantAuthoriser` runs under the §2.2 ceremony with an existing authorised key (`require_device`), via the existing add-authoriser circuit. | Authority is granted exactly once, in the user's first-party context; the platform cannot present an authoriser and never needs to. | requirements §3.5, §2.2 |
| D-3 | The payload is a **versioned `protocol` type** (scheme tag, public key, optional label) with its codec in `core`. | Both ends must agree on the bytes; protocol ships zero logic (architecture §4.4). | architecture §4.4 |
| D-4 | The trust channel is **physical**: the user scans the screen they intend to authorise, and the PWA displays the key fingerprint (and label, marked untrusted) before the ceremony. | The deliberate scanning act plus the fingerprint display is the out-of-band human check; a remote attacker cannot inject a payload into a scan they cannot physically present. | onboarding-and-key-authorisation.md §6 |
| D-5 | The platform detects the grant via **indexer lookup by its public key**, or implicitly by its next authorised call verifying. | No callback channel is needed; the chain is the truth channel (dapp-connection.md §1 invariant c). | onboarding-and-key-authorisation.md §6 |
| D-6 | **Provider keys are P-256, never passkey/PRF.** PRF is the self-custody passkey mechanism; a managed provider signs with its P-256 secure-signer key per §2.3 — attached via the one-time binding today, directly as in-circuit P-256 verification lands (passport#117). | Providers hold keys in secure signers/HSMs, which are P-256-native and cannot do WebAuthn ceremonies; the scheme tag carries the distinction. | requirements §2.3; provider-integration.md §4.1 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── mn-passport-protocol (types + constants only) ──
export interface AuthoriserRequestV1 {
  v: 1;
  // 'ecdsa-p256' is the provider scheme (§2.3): attached via the one-time
  // binding today, directly in-circuit as P-256 support lands (passport#117).
  scheme: 'ecdsa-p256' | 'jubjub-schnorr' | 'hash-preimage-commitment';
  publicKey: Uint8Array;       // or commitment, per scheme
  label?: string;              // display hint — untrusted, attacker-chosen
}

// ── core (codec + PWA-side flow) ──
export function encodeAuthoriserRequest(req: AuthoriserRequestV1): Uint8Array;
export function decodeAuthoriserRequest(bytes: Uint8Array): AuthoriserRequestV1;
export function grantAuthoriser(req: AuthoriserRequestV1): Promise<void>; // ceremony + require_device

// ── mn-passport-onboard (facade, platform side) ──
export function createAuthoriserRequest(opts?: { label?: string }): Promise<{
  payload: AuthoriserRequestV1;
  encoded: string;             // QR content / copyable string
}>;
export function awaitGrant(payload: AuthoriserRequestV1): Promise<{ account: AccAddress }>;
```

## 5. Flow

Per [`onboarding-and-key-authorisation.md`](../../../onboarding-and-key-authorisation.md) §6 — the
sequence diagram there is normative for this spec.

## 6. Dependencies

- **FS-2.3** (the facade exists), **FS-0.3/0.4** (kernel + signer seam).
- Existing add-authoriser bindings in `mn-passport-contract` (present in
  the committed artefact).
- **Gate: none beyond the kernel/seams** — no contract-team change.

## 7. Acceptance criteria

1. Handoff round-trip: platform exposes the payload → PWA decodes, shows
   fingerprint, grants under ceremony → the platform's next authorised
   call verifies (and `awaitGrant` resolves with the account).
2. `grantAuthoriser` is impossible without an existing authorised key and
   a ceremony; the payload alone never changes authority.
3. The payload codec round-trips, rejects unknown versions, and bounds the
   label; fingerprint display data is exposed to the approval UI with the
   label marked untrusted.
4. The same-device path (copyable string / deep link) round-trips
   equivalently to the QR path.

## 8. Verify plan

Flow tests with dev seams; then a devnet round-trip with two browser
profiles: the "platform" profile generates the key and displays the encoded
payload, the "PWA" profile decodes and grants, the platform profile detects
the grant (indexer) and performs an authorised, device-gated call.

## 9. Proposed tranches (≤ 400 net lines each)

1. **T1 — protocol payload types + `core` codec + `grantAuthoriser`**
   against dev seams (+ round-trip and rejection tests).
2. **T2 — facade `createAuthoriserRequest` + `awaitGrant`** (indexer
   detection).
3. **T3 — devnet round-trip** + fingerprint/display data hardening.

## 10. Respecting the normative MUSTs

- **Ceremony gate (§2.2):** the grant is ceremony-gated; the proposal
  carries no authority.
- **Identity is the ACC (§1.1):** the granted key is a revocable authoriser;
  the account is untouched as the seat of identity.
- **Provider-free path (§2.1):** works with any §2.3-conformant key; no
  provider in the loop.
- **Two version axes (§4.6):** the add-authoriser call rides the existing
  contract bindings; the payload version is a protocol-side axis.

## 11. Open questions

- **OQ-1** — dedicated SDK issue (currently #77).
- **OQ-2** — payload encoding for QR: size budget, alphabet, and the
  deep-link form for the same-device case.
- **OQ-3** — does the payload carry an account hint, or does the platform
  always discover the account post-grant via the indexer?
- **OQ-4** — label display rules: the label is attacker-chosen data — how
  the approval UI renders it without lending it authority.
- **OQ-5** — grant revocation UX: removing a platform key is the existing
  remove-authoriser flow; confirm the PWA surfaces it alongside the grant
  history.
