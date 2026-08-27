# M2 — Connect (feature specs)

> The dApp side: the thin connector (**Sign-In-with-Passport** returning the
> profile `{ name, account }`), the **partner-origin issuance facade**
> (FS-2.3), and **authorising additional keys** (FS-2.4). No witness
> provisioning, no scoped grants, no deposits.
> Backing: [`sdk-requirements.md`](../../sdk-requirements.md) §3.9, §3.13 &
> §3.5,
> [`architecture.md`](../../architecture.md) §4.4 & §4.6,
> [`beta-scope.md`](../../beta-scope.md) §2(4)–(5),
> [`onboarding-and-key-authorisation.md`](../../onboarding-and-key-authorisation.md).
> FS-2.1/2.2 are mostly parallel with M1 (build against a fixture ACC);
> FS-2.3 depends on the kernel and seams (FS-0.3–0.8) and the M1 rails.

## FS-2.1 — Protocol wire types (`mn-passport-protocol`, C23)

- **Objective.** Define the dApp ↔ wallet wire types for sign-in + profile —
  types only, so `connect` stays free of `core`.
- **In scope.** The C23 message schema: sign-in request/response and the profile
  `{ name, account }`; a wire version tag.
- **Out of scope.** Any logic; anything beyond sign-in + profile.
- **Backing.** requirements §3.9; architecture §4.4 (protocol package keeps
  `connect` core-free), §4.6 (wire version axis).
- **Surface (indicative).** `SignInRequest`, `SignInResponse`,
  `Profile { name, account }`, `WIRE_VERSION`.
- **Dependencies.** FS-0.1. **Gate:** none.
- **Acceptance.** Types compile and are versioned; both `connect` and a dApp
  import them without pulling `core`.
- **Verify.** Type-check; a serialise/deserialise round-trip fixture.
- **Tranches.** (1) the schema + version tag (single small PR).
- **Open questions.** Confirm the beta profile is exactly `{ name, account }`
  (beta-scope §2(4) says yes).
- **Issue.** `#TBD`

## FS-2.2 — Sign-In-with-Passport + profile (`mn-passport-connect`)

- **Objective.** The thin connector a dApp installs to sign a user in and read
  their profile.
- **In scope.** The sign-in handshake returning `{ name, account }`;
  **core-free** (must not link `mn-passport-core`); consumes the protocol types.
- **Out of scope.** Witness provisioning (#58), grant issuance/spend, deposits —
  all deferred (beta-scope §4).
- **Backing.** requirements §3.9; beta-scope §2(4); architecture §4.4 (connect is
  thin and core-free), §4.6 (the composition example).
- **Surface (indicative).** `connect() → session`; `session.signIn() → Profile`.
- **Dependencies.** FS-2.1. **Gate:** none (reads a deployed ACC's public
  profile; develop against a fixture ACC, integrate a real one when M1 lands).
- **Acceptance.** A dApp signs a user in and reads `{ name, account }`; the
  `connect` bundle demonstrably does **not** include `core`.
- **Verify.** `mn-passport-skills-conformance` asserts the bundle boundary (arch §4.4);
  e2e sign-in against a fixture ACC and then a real one.
- **Tranches.** (1) handshake + profile read against a fixture; (2) real-ACC
  read; (3) the bundle-boundary conformance test.
- **Open questions.** The sign-in proof/signature shape — is SIWP a `signData`
  over a challenge (provider-integration §5.3)? Session persistence across
  origins (recall the cross-origin isolation constraint).
- **Issue.** `#TBD`

## FS-2.3 — Partner-origin onboarding (`mn-passport-onboard`)

- **Objective.** A partner dApp issues a Passport in place: passkey under the
  Passport RP ID (Related Origin Request), ACC deployed via a **direct
  connection to the third-party proving and DUST sponsorship service** (fees
  sponsored; no provider in the loop), the deployed address stamped onto the
  credential via largeBlob; sign-in with the existing passkey. Passkey/PRF
  path only — the managed provider-authoriser variant is a future iteration.
- **In scope.** The `protocol` shared constants (RP ID, PRF device-key salt,
  versioned largeBlob schema — types only; the pure codec lives in `core`,
  protocol ships zero logic); the `Platform.ceremony`
  extension (`createCredential`, bundled PRF + largeBlob assertions) with its
  `adapter-browser` implementation; `core`'s onboard and sign-in flows; the
  `mn-passport-onboard` facade (`createPassport`, `signIn`, capability
  detection, indexer fallback on blob miss); the direct integration with the
  third-party proving and DUST sponsorship service (sealed preimage).
- **Out of scope.** The managed (provider authoriser + routing) variant —
  future iteration, TODO recorded in
  [`onboarding-and-key-authorisation.md`](../../onboarding-and-key-authorisation.md) §5; grants,
  recovery, device management, assets, witness provisioning; the redirect
  fallback's PWA half (it is the existing first-party onboarding);
  origins-list hosting/governance implementation.
- **Backing.** requirements §3.13; [`onboarding-and-key-authorisation.md`](../../onboarding-and-key-authorisation.md);
  architecture §4.4 (the recorded facade exception, ADR 0005); beta-scope
  §2(5); `experiments/passkey-prf-linking/findings.md` (mechanism confirmed,
  compatibility floor).
- **Surface (indicative).** `createPassport(opts) → { account, credentialId,
  publicKey }`; `signIn(opts) → { account, publicKey }`;
  `passkeyAuthoriser()` behind the FS-0.4 signer seam (the seam is where the
  future managed authoriser slots in); `PASSPORT_RP_ID`,
  `PRF_DEVICE_KEY_SALT`, `encodeBlob`/`decodeBlob`.
- **Dependencies.** FS-0.3–0.8 (kernel + seams), FS-1.x rails for real
  integration (mocked until then), FS-2.1 wire types. **Gate:** the
  related-origins well-known deployment on the Passport domain.
- **Acceptance.** Issue → recognise round-trip green in the harness (two
  prompts to issue, one to sign in); blob miss degrades to the indexer path;
  `connect` remains core-free; the facade exposes no lifecycle surface.
- **Verify.** The `experiments/passkey-prf-linking` e2e harness lifted to
  drive the real packages (virtual authenticator; ROR negative control).
- **Tranches (proposed).** (1) protocol constants + `core` blob codec; (2)
  `Platform.ceremony` extension + `adapter-browser` ceremonies; (3) `core`
  onboard/sign-in flows against dev seams; (4) the facade + indexer
  fallback; (5) direct third-party-service integration (sealed preimage,
  sponsored settlement).
- **Open questions.** Challenge-verification topology; production RP ID and
  origins-list governance; whether the PWA adopts the same bundled-ceremony
  shape (it should — one implementation in `core`).
- **Issue.** midnightntwrk/passport#77 (C27 · Passport Facade) — a dedicated
  issue may replace it before spec-driver plans.

## FS-2.4 — Authorising additional keys (`mn-passport-onboard` + `core`)

- **Objective.** An existing Passport user joins a **new external platform**
  (a Passport-embedding environment or managed provider needing its own
  authoriser key — never a dApp, which uses the connector and holds no
  account key): the platform generates its key per §2.3 — for a provider,
  its **P-256 secure-signer key**, never passkey/PRF — and **exposes the
  public key, preferably as a QR**; the **Passport PWA scans it** and, with
  an existing authorised key under the ceremony, **approves the key into
  the ACC's authoriser key set** via the existing `add_device` circuit. The
  proposal never touches the chain; only the PWA signs.
- **In scope.** The signed authoriser-request payload types (`protocol`;
  codec in `core`); the facade's `createAuthoriserRequest` (payload +
  QR/string encoding; provider-held-key arm) and `awaitApproval`
  (commitment-indexed detection); `core`'s devices-flow
  `addAuthoriserKey(payload)` (verification, then ceremony +
  `require_device` + `add_device`).
- **Out of scope.** Any ACC change (none is needed — the win of this
  shape); recovery interactions; grant issuance; QR rendering itself (UI).
- **Backing.** requirements §3.5 (out-of-band handoff) & §3.13;
  [`onboarding-and-key-authorisation.md`](../../onboarding-and-key-authorisation.md) §6.
- **Surface.** Per FS-2.4 §4 (canonical): `createAuthoriserRequest`,
  `awaitApproval` (facade); `addAuthoriserKey(payload)` (core devices flow).
- **Dependencies.** FS-2.3 (the facade), FS-0.3/0.4 (kernel + signer),
  existing `add_device` + `derive_device_commitment` bindings
  (`mn-passport-contract`). **Gate:** none beyond the kernel/seams — no
  contract-team change.
- **Acceptance / verify / tranches.** Per FS-2.4 §7–§9 (canonical — this
  brief deliberately does not restate them).
- **Open questions.** Per FS-2.4 §11 (QR ergonomics, account-hint policy,
  scheme registry, revocation surfacing, the in-circuit graduation).
- **Issue.** midnightntwrk/passport#77 — a dedicated SDK issue should
  replace it before planning.
