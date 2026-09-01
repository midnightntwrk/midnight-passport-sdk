# FS-2.4 — Authorising additional keys (platforms and providers)

> **Status:** draft · 2026/08/27 · authored per `mn-passport-skills:spec-author` conventions
> **Supersedes:** the candidate-registry shape drafted 2026/08/24 — the
> on-chain candidates store, cap, expiry, and new circuits are all removed;
> the proposal travels out-of-band and only the approval touches the chain.
> **Milestone:** M2 — Connect ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M2-connect.md`](../../milestones/M2-connect.md) § FS-2.4.
> **Backing:** [`onboarding-and-key-authorisation.md`](../../../onboarding-and-key-authorisation.md) §6
> (the design), [`sdk-requirements.md`](../../../sdk-requirements.md) §3.5
> (the out-of-band handoff rule), §2.3 (the binding pattern), and §3.13,
> [`architecture.md`](../../../architecture.md) §4.4.
> **GitHub issue:** **midnightntwrk/passport#77** (C27 · Passport Facade) —
> a dedicated SDK issue should replace it before spec-driver plans (OQ-1).

## 1. Objective

Let an existing Passport user join a **new external platform** — a
Passport-embedding environment or a managed provider needing its own
authoriser key for the user; never a dApp, which integrates through the
connector (§3.9) and holds no account key — when the existing credential
cannot follow them. The platform generates (or already holds) its key per
the §2.3 signing requirements and exposes a **signed authoriser request**
out-of-band, preferably as a QR code; the **Passport PWA scans it**,
verifies proof of possession, and — under the §2.2 ceremony with an
existing authorised key — **approves it into the ACC's authoriser key set**
via the **existing `add_device` circuit**. The proposal never touches the
chain; the PWA is the only party that receives the request and the only
party that signs the approval.

## 2. Scope

### In

- **`mn-passport-protocol`**: the **authoriser-request payload** — a
  versioned, `scheme`-discriminated type carrying the public key, the
  §2.3-derived **device commitment** (the value `add_device` actually
  takes), an optional account hint, a **nonce**, an **expiry**, a bounded
  label, and a **self-signature** (the §2.3 binding message: proof of
  possession over all prior fields). Types and constants only; the codec
  lives in `core`.
- **The `onboard` facade (platform side)**: `createAuthoriserRequest` —
  either generates the key per §2.3 **or accepts a caller-held key with a
  signing callback** (the provider/HSM case: the private key never enters
  the facade); returns the payload and its string encoding.
  `awaitApproval` — detects the approval landing by **indexer lookup on the
  device commitment** (the same index as the design doc §4 blob-miss
  fallback), scoped by the account hint, with documented polling defaults
  and a timeout bounded by the payload expiry.
- **`core` devices flow (PWA side)**: `addAuthoriserKey(payload)` — takes
  the already-decoded payload (decoding is the codec's job), **verifies the
  self-signature, nonce freshness, expiry, and account match** before any
  ceremony UI, exposes the key fingerprint (scheme-correct) and the
  untrusted label to the approval UI, then submits the existing
  `add_device(commitment)` call.
- **`mn-passport-contract`**: no new bindings — `add_device` and
  `derive_device_commitment` exist in the committed artefact.

### Out

- **Any ACC contract change — none is needed**: the on-chain surface is
  exactly the existing `add_device(commitment)` circuit (verified against
  the committed artefact's circuit inventory). The **typed on-chain
  binding entry** for the P-256 identity (in-circuit verification of the
  binding signature) is the C1 evolution §2.3 already anticipates —
  tracked upstream (secp256r1 is frozen into ZKIR 3.0; the Compact surface
  is LFDT-Minokawa/compact#674), not gated on here: until it lands, the
  binding signature is verified **client-side by the PWA at approval time**
  and retained as provenance.
- QR rendering and scanning UI (the PWA's surface; this spec ships the
  flows and payload it uses).
- Recovery interactions (C13–C15), scoped-grant issuance, agent principals.

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | **The proposal travels out-of-band; only the approval touches the chain.** The platform exposes a signed request (QR primary; copyable string / deep link for the same-device case); nothing unauthorised ever writes to the ACC. | A signed request is public data — it needs no on-chain registry; removing the registry removes the spam surface, the cap policy, and any contract change. | onboarding-and-key-authorisation.md §6 |
| D-2 | **The PWA is the sole approving party**: `addAuthoriserKey` runs under the §2.2 ceremony with an existing authorised key (`require_device`), calling the existing `add_device(commitment)` circuit. | Authority is granted exactly once, in the user's first-party context; the platform cannot present an authoriser and never needs to. | requirements §3.5, §2.2 |
| D-3 | The payload is a **versioned, `scheme`-discriminated `protocol` type** with its codec in `core`; the label is bounded (≤ 64 bytes) and untrusted. | Both ends must agree on the bytes; a discriminated union makes the fingerprint dispatch total (the bytes of a curve point and a commitment are rendered differently); protocol ships zero logic. | architecture §4.4; CLAUDE.md typing rule |
| D-4 | **The payload carries proof of possession and anti-replay material**: a self-signature (the §2.3 binding message) over `{v, scheme, publicKey, commitment, account?, nonce, expiresAt, label?}`, a nonce, and an expiry. The PWA rejects unverifiable, expired, or account-mismatched payloads before any ceremony. | Without the signature the PWA would grant authority to a key nobody demonstrated controlling, and the §2.3 binding would be inexpressible; without nonce/expiry a screenshotted QR stays valid forever and `awaitApproval` cannot identify its own approval. | requirements §2.3; review 2026/08/27 |
| D-5 | The platform detects the approval via **indexer lookup on the device commitment**, scoped by the account hint; `awaitApproval` documents polling defaults (5 s initial, ×1.5 backoff, 30 s cap) and times out at payload expiry. | The public key never appears on chain — the authoriser key set is commitment-keyed; the chain is the truth channel (dapp-connection.md §1, third invariant). | manifest circuit inventory; onboarding-and-key-authorisation.md §6 |
| D-6 | **Provider keys are P-256, never passkey/PRF.** A managed provider holds its key in a secure signer/HSM, so `createAuthoriserRequest` accepts a caller-held public key plus a signing callback — the private key never enters the facade; the generate-here arm serves platforms without an external signer. | Secure signers are P-256-native and cannot do WebAuthn ceremonies; an HSM key is generated inside the HSM. | requirements §2.3; provider-integration.md §4.1 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── mn-passport-protocol (types + constants only) ──
export const AUTHORISER_LABEL_MAX_BYTES = 64;
export type AuthoriserRequestV1 = { v: 1 } & (
  | { scheme: 'ecdsa-p256'; publicKey: Uint8Array /* 33, compressed */ }
  | { scheme: 'jubjub-schnorr'; publicKey: Uint8Array /* 32 */ }
) & {
  commitment: Uint8Array;      // 32 — the §2.3-derived device commitment add_device takes
  account?: Uint8Array;        // 32 — ACC address hint (multi-account safety; scopes detection)
  nonce: Uint8Array;           // 16 — lets awaitApproval identify its own approval
  expiresAt: number;           // unix seconds — payload is dead after this
  label?: string;              // ≤ AUTHORISER_LABEL_MAX_BYTES; display hint, untrusted
  signature: Uint8Array;       // self-signature (§2.3 binding) over all prior fields
};

// ── core (codec + PWA-side flow) ──
export function encodeAuthoriserRequest(payload: AuthoriserRequestV1): Uint8Array;
export function encodeAuthoriserRequestString(payload: AuthoriserRequestV1): string; // base64url — QR / copyable form
export function decodeAuthoriserRequest(input: Uint8Array | string): AuthoriserRequestV1; // rejects unknown v, oversized label, bad signature shape
export function addAuthoriserKey(payload: AuthoriserRequestV1): Promise<void>;
// verifies signature + nonce + expiry + account match FIRST, then ceremony +
// require_device, then add_device(commitment). Named to avoid the §3.8 term
// of art "grant authoriser" (a lesser, scoped key) — this adds a full one.

// ── mn-passport-onboard (facade, platform side) ──
export function createAuthoriserRequest(opts?: {
  label?: string;
  account?: Uint8Array;
  expiresInSeconds?: number;   // default 600
  key?: {                      // provider/HSM arm — private key never enters the facade
    scheme: 'ecdsa-p256' | 'jubjub-schnorr';
    publicKey: Uint8Array;
    sign(message: Uint8Array): Promise<Uint8Array>;
  };
}): Promise<{ payload: AuthoriserRequestV1; encoded: string }>;
export function awaitApproval(payload: AuthoriserRequestV1, opts?: {
  pollIntervalMs?: number;     // default 5000, ×1.5 backoff, 30 s cap
  timeoutMs?: number;          // default: until payload.expiresAt
}): Promise<{ account: AccAddress }>;
```

## 5. Flow

Per [`onboarding-and-key-authorisation.md`](../../../onboarding-and-key-authorisation.md) §6 — the
sequence diagram there is normative for this spec.

## 6. Dependencies

- **FS-2.3** (the facade exists), **FS-0.3/0.4** (kernel + signer seam).
- Existing `add_device` + `derive_device_commitment` bindings in
  `mn-passport-contract` (present in the committed artefact — verified
  against `manifest.generated.ts`).
- The commitment-indexed lookup (shared with the FS-2.3 blob-miss fallback;
  feeds the FS-0.6 read-side indexer seam question).
- **Gate: none beyond the kernel/seams** — no contract-team change.

## 7. Acceptance criteria

1. Handoff round-trip: platform emits the signed payload → PWA decodes,
   verifies possession/nonce/expiry/account, shows fingerprint, approves
   under ceremony → `add_device` lands → `awaitApproval` resolves with the
   account and the platform's next authorised call verifies.
2. `addAuthoriserKey` is impossible without an existing authorised key and
   a ceremony; the payload alone never changes authority.
3. Tamper matrix rejected **before any ceremony UI**: bad signature, expired
   payload, replayed nonce (already-approved), account mismatch, oversized
   label, unknown version.
4. The fingerprint shown is scheme-correct (curve point vs commitment render
   differently) and the label is displayed as untrusted data.
5. The same-device path (copyable string / deep link) round-trips
   equivalently to the QR path via `encodeAuthoriserRequestString` /
   `decodeAuthoriserRequest(string)`.
6. `awaitApproval` honours the polling defaults and times out at payload
   expiry without resolving on a stale approval of the same key.

## 8. Verify plan

Flow tests with dev seams, including the §7.3 tamper matrix; then a devnet
round-trip with two browser profiles: the "platform" profile creates and
displays the signed payload, the "PWA" profile decodes and approves, the
platform profile detects the approval (commitment lookup) and performs an
authorised, device-gated call; spam/replay cases exercised end-to-end.

## 9. Proposed tranches (≤ 400 net lines each)

1. **T1 — protocol payload types + `core` codec + verification** (signature,
   nonce, expiry, account, label bound; tamper-matrix tests).
2. **T2 — `core` `addAuthoriserKey`** against dev seams (ceremony +
   `add_device`).
3. **T3 — facade `createAuthoriserRequest` (both arms) + `awaitApproval`**
   (polling/backoff/timeout).
4. **T4 — devnet round-trip** + fingerprint/display hardening.

## 10. Respecting the normative MUSTs

- **Ceremony gate (§2.2):** the approval is ceremony-gated; the request
  carries no authority; payload verification happens before the ceremony so
  the user is never prompted for a request that would be rejected.
- **Encrypt-preimage-to-enclave (§2.5):** the `add_device` call is a proven
  contract call; on the remote-proving path its preimage (which embeds the
  `require_device` witness) is sealed to the service's enclave key before
  leaving the device — unchanged.
- **Identity is the ACC (§1.1) / provider-free path (§2.1):** the approved
  key is a revocable authoriser; the flow works with any §2.3-conformant
  key and user-paid fees; no provider is required.
- **Deposit-not-address (§3.12):** untouched — nothing here surfaces a
  payable address.
- **Two version axes (§4.6):** `add_device` rides the existing contract
  bindings (binding axis); the payload `v` is a protocol-side axis.

## 11. Open questions

- **OQ-1** — dedicated SDK issue (currently #77).
- **OQ-2** — QR ergonomics: payload size after the signature (~200 bytes →
  comfortably QR-able, but confirm), the deep-link form, and the alphabet.
- **OQ-3** — the commitment-indexed lookup shape when no account hint is
  present (unbounded scan is unacceptable; likely: require the hint, or the
  platform asks the user for their Passport name).
- **OQ-4** — scheme registry: this union extends FS-0.4's
  (`'jubjub-schnorr' | 'ecdsa-secp256k1'`) with `'ecdsa-p256'` — reconcile
  into one `protocol`-owned registry before both calcify.
- **OQ-5** — revocation surfacing: removal is the existing
  remove-authoriser flow (`remove_device`); confirm the PWA surfaces it
  beside the approval history.
- **OQ-6** — the client-side binding-signature verification graduates to
  the typed on-chain entry when in-circuit secp256r1 lands
  (LFDT-Minokawa/compact#674) — record the migration as part of the C1
  evolution.
