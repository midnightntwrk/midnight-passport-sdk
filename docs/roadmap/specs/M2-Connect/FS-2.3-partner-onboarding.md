# FS-2.3 — Partner-origin onboarding (`mn-passport-onboard`)

> **Status:** draft · 2026/08/18 · authored per `mn-passport-skills:spec-author` conventions
> **Milestone:** M2 — Connect ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M2-connect.md`](../../milestones/M2-connect.md) § FS-2.3.
> **Backing:** [`partner-onboarding.md`](../../../partner-onboarding.md) (the
> design), [`sdk-requirements.md`](../../../sdk-requirements.md) §3.13,
> [`architecture.md`](../../../architecture.md) §4.4,
> [`provider-integration.md`](../../../provider-integration.md),
> [ADR 0005](../../../adr/0005-partner-origin-onboarding-ror.md),
> `experiments/passkey-prf-linking/findings.md` (mechanism confirmed
> 2026/08/17–18, compatibility floor measured).
> **GitHub issue:** **midnightntwrk/passport#77** (C27 · Passport Facade) —
> a dedicated issue may replace it before spec-driver plans (OQ-1).

## 1. Objective

Let a partner dApp **issue a Passport in place**: create a passkey under the
Passport RP ID (WebAuthn Related Origin Request), deploy the user's ACC via
a **direct connection to the third-party proving and DUST sponsorship
service** (sealed preimage, sponsored fees — no provider in the loop), and
stamp the deployed ACC address onto the credential (largeBlob) so the
Passport app — or the partner, later — **recognises** the account from a
single ceremony. Support sign-in with the existing passkey. **Passkey/PRF
path only**: the managed provider-authoriser variant is a future iteration
(partner-onboarding.md §5).

## 2. Scope

### In

- **`mn-passport-protocol` shared constants**: `PASSPORT_RP_ID`
  (config-overridable default), `PRF_DEVICE_KEY_SALT`
  (`mn-passport/prf/device-key/v1` — fixes FS-0.8's provisional salt), and
  the versioned **largeBlob payload schema** (types + constants only); the
  pure codec (`encodeBlob`/`decodeBlob`) lives in `core` — protocol ships
  zero runtime logic (architecture §4.4).
- **`Platform.ceremony` extension** (types in `core`, per FS-0.8's shape):
  `createCredential(...)` and bundled PRF + largeBlob assertions; `core`
  never learns WebAuthn exists.
- **`adapter-browser`** (first real slice): the WebAuthn/ROR ceremony
  implementation, lifted from the experiment's validated `webauthn.ts`.
- **`core` flows**: `onboard` (ceremony → device secret → commitments via
  the bound ACC module → `buildDeployArgs` → seams → largeBlob attach) and
  `signIn` (assert → derive → blob decode → chain verification), consuming
  only the FS-0.3 kernel and FS-0.4–0.8 seams.
- **The `mn-passport-onboard` facade**: `createPassport`, `signIn`,
  capability detection, the indexer fallback on blob miss. Composition only.
- **Direct service integration**: `adapter-prover-remote` + settlement
  calling the third-party proving and DUST sponsorship service itself —
  preimage sealed to the service's enclave key, the service proves,
  balances, sponsors, and binds in one process, the SDK broadcasts.

### Out

- **The managed variant** (provider authoriser + routing,
  provider-integration §4.1) — future iteration; the signer seam is its
  slot-in point, and partner-onboarding.md §5 carries the TODO.
- Grants, recovery, device management, assets, witness provisioning, name
  claim (blocked on C2), deposits.
- The redirect fallback's PWA half (it is the existing first-party
  onboarding, M1).
- Origins-list hosting and governance implementation (operational; §3.13).
- Challenge-verification topology for third-party assertion consumers
  (OQ-2).

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | `mn-passport-onboard` is a **facade over `core` + adapters** — it links the kernel and exposes only `createPassport`/`signIn`. | Issuance is custody work: one kernel implementation, no duplicated secret handling; reduced scope is API narrowness, not reimplementation. | ADR 0005; architecture §4.4 |
| D-2 | The `connect` rule is untouched: the conversational package stays core-free; `onboard` is the recorded exception. | Different threat models deserve different packages; embedding the kernel is honest for issuance, wrong for conversation. | architecture §4.4 |
| D-3 | RP ID, PRF salt, and blob schema live in `protocol`. | Partner and Passport must agree on all three or recognition breaks; `protocol` is the no-logic shared-contract home. | requirements §3.13 |
| D-4 | Ceremony budget is the spec floor: issuance = `create()` (bundled `prf.eval`) + one `get()` (`prf.eval` + `largeBlob.write`); sign-in = one bundled `get()`. A dropped extension is a measured finding, not a reason to add prompts. | Confirmed automated + on a real authenticator; largeBlob writes are illegal at `create()`. | findings.md, ceremony-discipline note |
| D-5 | **largeBlob is a cache, never the source of truth**: blob miss → indexer lookup by device commitment; blob hit → verified against chain state before trust. | GPM and Windows Hello lack largeBlob; the ACC is the identity (P8, chain-only). | findings.md compatibility floor; requirements §1.1 |
| D-6 | Capability detection + the mandatory redirect fallback are part of the facade's public surface. | Below the ROR/PRF floor the partner must route users to first-party onboarding, not fail. | partner-onboarding.md §6 |
| D-7 | The facade connects **directly** to the third-party proving and DUST sponsorship service (sealed preimage → the service proves/balances/sponsors/binds in one process → SDK broadcasts); no provider in the loop on this path. | Passkey/PRF issuance has no provider by definition; the service's surface is the same one the managed rails use, so nothing is invented. The provider-routed managed variant is deferred. | partner-onboarding.md §3, §5; provider-integration.md §5 |

## 4. Surface and interfaces

> Indicative (architecture §4.6 convention).

```ts
// ── mn-passport-protocol (types + constants only, zero logic) ──
export const PASSPORT_RP_ID: string;                 // default; every API takes rpId?
export const PRF_DEVICE_KEY_SALT: Uint8Array;        // 'mn-passport/prf/device-key/v1'
export interface PassportBlobV1 { v: 1; acc: Uint8Array /* 32 */; binding: string }

// ── core: the blob codec (pure; protocol ships no logic) ──
export function encodeBlob(blob: PassportBlobV1): Uint8Array;
export function decodeBlob(bytes: Uint8Array): PassportBlobV1;

// ── core: Platform.ceremony extension (FS-0.8 shape) ──
interface CeremonyPrimitives {
  prfEvaluate(salt: Uint8Array): Promise<Uint8Array>;
  kdfFromPassword(prompt: CeremonyPrompt): Promise<Uint8Array>;
  createCredential(opts: { rpId: string; user: string; prfSalt: Uint8Array }): Promise<CreatedCredential>;
  assertBundled(opts: { rpId: string; prfSalt?: Uint8Array; blob?: 'read' | { write: Uint8Array }; credentialId?: Uint8Array }): Promise<BundledAssertion>;
  capabilities(): { prf: boolean; largeBlob: boolean; relatedOrigins: boolean };
}

// ── mn-passport-onboard (facade) ──
export interface OnboardConfig { rpId?: string; authoriser?: Authoriser; indexerUrl?: string }
export function createPassport(cfg?: OnboardConfig): Promise<{ account: AccAddress; credentialId: Uint8Array; publicKey: Uint8Array }>;
export function signIn(cfg?: OnboardConfig): Promise<{ account: AccAddress; publicKey: Uint8Array }>;
export function capabilities(): { canIssueHere: boolean; reasons: string[] };   // drives the redirect fallback
export function passkeyAuthoriser(): Authoriser;      // adapter-signer-local (FS-0.4 seam)
// The managed providerAuthoriser(...) fills the same seam in a future iteration.
```

## 5. Flow

Per [`partner-onboarding.md`](../../../partner-onboarding.md) §3–§4 (issue
on the passkey/PRF path, sign-in — the sequence diagrams there are normative
for this spec; §5's managed variant is a recorded TODO, out of scope here).

## 6. Dependencies

- **FS-0.3–0.8** — kernel + the five seams (today authored, unplanned,
  `export {}` in code): hard prerequisite, promoted to the beta critical
  path by this spec (beta-scope §5).
- **FS-2.1** — protocol package exists (the constants ride it).
- **FS-1.x rails** for real integration — mocked (dev seams) until then.
- **Gates:** the related-origins well-known deployed on the Passport domain;
  the third-party proving and DUST sponsorship service reachable for
  **direct** (provider-less) calls, with a sponsorship policy (OQ-6).

## 7. Acceptance criteria

1. Issue → recognise round-trip green in the harness: two prompts to issue,
   one to sign in; identical derived key both sides; blob round-trips.
2. Blob miss degrades to the indexer lookup; a stale blob never wins over
   chain state.
3. ROR negative control holds (unlisted origin → `SecurityError`).
4. `capabilities()` correctly gates: below the floor, `canIssueHere: false`
   with reasons.
5. The deploy round-trips the third-party service **directly**: preimage
   sealed to the service's enclave key, sealed balanced tx returned, SDK
   broadcasts (mocked service in CI; real endpoint behind the gate).
6. `connect` remains demonstrably core-free; `onboard`'s facade exports no
   lifecycle surface beyond `createPassport`/`signIn`/`capabilities`.
7. Constants are imported from `protocol` by both the facade and the PWA
   path — no literal duplicated.

## 8. Verify plan

Lift `experiments/passkey-prf-linking/` to drive the real packages: the
Playwright + CDP virtual-authenticator e2e (CTAP 2.1, PRF + largeBlob)
becomes the automated issue/recognise round-trip against the facade; the ROR
negative control and the blob-miss fallback are explicit cases. Real-device
rows (macOS confirmed; Windows/Android pending) accumulate in the findings
support matrix per C9. Deploy runs against dev seams (mock prover/settlement)
until the M1 rails integrate.

## 9. Proposed tranches (≤ 400 net lines each)

1. **T1 — protocol constants + schema types, and the `core` blob codec**
   (+ round-trip tests).
2. **T2 — `Platform.ceremony` extension + `adapter-browser` ceremonies**
   (lifted from the experiment's `webauthn.ts`; capability probing).
3. **T3 — `core` onboard/sign-in flows** against dev seams (mock prover,
   mock settlement, dev signer; commitments via the bound ACC module).
4. **T4 — the `onboard` facade** + indexer fallback + capability gate.
5. **T5 — direct third-party-service integration** (`adapter-prover-remote`
   + settlement: sealed preimage, sponsored settlement, broadcast).

## 10. Respecting the normative MUSTs

- **Ceremony gate (§2.2):** every secret derivation happens inside a
  ceremony; the PRF output is the ceremony product itself.
- **Encrypt-preimage-to-enclave (§2.5):** the deploy preimage is sealed per
  provider-integration before it leaves the device — unchanged rails.
- **Deposit-not-address (§3.12):** untouched; the facade never surfaces a
  raw address as payable.
- **Two version axes (§4.6):** the blob's `binding` field carries the
  contract-binding tag; recognition routes through `resolveBinding` /
  `detectDeployedVersion`.
- **§3.13 MUSTs:** constants from `protocol`; blob-as-cache; mandatory
  redirect fallback; curated origins.

## 11. Open questions

- **OQ-1** — dedicated GitHub issue (currently #77).
- **OQ-2** — challenge-verification topology for assertions consumed by
  third parties (Passport verification service vs in-circuit secp256r1,
  once it lands).
- **OQ-3** — production RP ID value and origins-list governance.
- **OQ-4** — does the PWA's own onboarding adopt the same bundled-ceremony
  shape (recommended: yes — one implementation in `core`)?
- **OQ-5** — indexer-lookup shape for the blob-miss fallback (feeds
  FS-0.6's read-side indexer seam question).
- **OQ-6** — sponsorship policy for direct, provider-less deploys: what
  authorises the service to sponsor DUST for a call arriving without a
  provider in front of it (per-partner credentials, rate limits, or open
  sponsorship)?
- **OQ-7** — the managed (provider authoriser + routing) partner-origin
  flow: to be designed and documented in a future iteration
  (partner-onboarding.md §5).
