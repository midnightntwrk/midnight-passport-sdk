# M2 — Connect (feature specs)

> The thin dApp-side connector: **Sign-In-with-Passport** returning the profile
> `{ name, account }`. No witness provisioning, no grants, no deposits.
> Backing: [`sdk-requirements.md`](../../sdk-requirements.md) §3.9,
> [`architecture.md`](../../architecture.md) §4.4 & §4.6, [`beta-scope.md`](../../beta-scope.md) §2(4).
> Mostly parallel with M1 — build against a fixture ACC; no external gate.

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
