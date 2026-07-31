# M1 — Managed onboarding (feature specs)

> Deploy the ACC and claim `alice.passport.night` end-to-end on the managed
> path, fees sponsored, on the three-actor model (device · Dynamic · BCW).
> Backing: [`provider-integration.md`](../../provider-integration.md),
> [`sdk-requirements.md`](../../sdk-requirements.md) §2–§3, [`beta-scope.md`](../../beta-scope.md) §2.
> **Gates:** Dynamic (signer), BCW (TEE prove + DUST), contract team (ACC + name service).

## FS-1.1 — Deploy + name-claim call construction

- **Objective.** Build the two onboarding contract calls, including the C5
  authorisation challenge.
- **In scope.** Typed builders for **deploy ACC** and **claim name**; challenge
  construction = `SHA-256(account ‖ circuit domain tag ‖ args ‖ auth_nonce)`
  with the JubJub-subgroup grind nonce; reading `auth_nonce` and public state
  from the indexer; assembling the **unsealed tx** with the signature as
  **public** call data.
- **Backing.** requirements §3.1 (onboarding), §2 (name service, C2);
  provider-integration §4.1, §5.1; canvases C5, C8.
- **Surface (indicative).** `buildDeployIntent(...)`,
  `buildNameClaimIntent(name)`, `computeChallenge(bundle)`,
  `assemblePreimage(signature)`.
- **Dependencies.** FS-0.2, FS-0.3. **Gate:** contract team (ACC + name service
  C2 artefacts).
- **Acceptance.** Given a signature, produces a valid unsealed tx for deploy and
  for claim; the challenge matches what the ACC's verifier expects.
- **Verify.** `contract-writer` / `witness-verifier` against the ACC; the
  challenge round-trips with a test signature. Full e2e is FS-1.2.
- **Tranches.** (1) challenge + `auth_nonce` read; (2) deploy builder;
  (3) name-claim builder.
- **Open questions.** Is name-claim an ACC circuit or a **separate name-service
  contract** (composability → may need the C2 artefact too)? `auth_nonce`
  advance semantics under concurrency.
- **Issue.** `#TBD`

## FS-1.2 — Managed onboarding flow

- **Objective.** Orchestrate onboarding end-to-end on the managed path.
- **In scope.** The flow: login/ceremony → build intent → **request auth
  signature (Signer / Dynamic)** → build preimage → seal → **prove (Prover /
  BCW)** → **settle (Settlement / BCW)** → await finalisation. Produces a
  deployed ACC + the claimed name.
- **Backing.** requirements §3.1; provider-integration §2–§3 (the sequence);
  beta-scope §2(1).
- **Surface (indicative).** `onboard({ name }) → { account, name }`.
- **Dependencies.** FS-1.1, FS-1.3, FS-1.4, FS-1.5. **Gate:** Dynamic + BCW
  (integration); buildable against mocks.
- **Acceptance.** A zero-DUST user gets a deployed ACC + claimed name
  end-to-end — against mocks in CI, against Dynamic + BCW in staging.
- **Verify.** `sdk-tester` e2e on devnet, the full sequence, mock then real.
- **Tranches.** (1) flow wired against mocks; (2) integrate signer + prover;
  (3) integrate settlement + finalisation.
- **Open questions.** Nonce-staleness handling (`auth_nonce` bumped between sign
  and submit → re-request); how the passkey presence gate sits in the managed path.
- **Issue.** `#TBD`

## FS-1.3 — `adapter-signer-managed` (Dynamic)

- **Objective.** The authoriser-signing seam to Dynamic.
- **In scope.** Request an authorisation signature for `{account, circuit tag,
  args, auth_nonce}`; **JubJub Schnorr** (ECDSA secp256k1 later); Dynamic
  applies policy and returns `(R, s)`; passkey login is the presence gate.
  Single per-account key, custodial (beta).
- **Backing.** provider-integration §4.1; requirements §2.4, §2.6.
- **Surface (indicative).** implements `Signer.requestAuthorisation(bundle)`.
- **Dependencies.** FS-0.4 (Signer seam). **Gate:** Dynamic (signer +
  registered ACC key); mockable.
- **Acceptance.** Returns a signature verifiable against the registered key.
- **Verify.** Verify `s·G == R + c·pk` against a test key; integration against
  Dynamic staging.
- **Tranches.** (1) request/response contract + mock signer; (2) Dynamic
  integration; (3) presence/login gating.
- **Open questions.** Dynamic's exact scheme + curve (provider-integration §9);
  transport (device-direct vs provider-proxied).
- **Issue.** `#TBD`

## FS-1.4 — `adapter-prover-remote` (BCW)

- **Objective.** The remote TEE proving seam to BCW.
- **In scope.** Seal the preimage to BCW's **enclave key**; `POST /prove` +
  `/check` (octet-stream; **`keyLocation` by reference**); pin the enclave key;
  do **not** upload prover keys (BCW fetches them by `keyLocation`).
- **Backing.** provider-integration §5.1; requirements §2.5 (path 2a).
- **Surface (indicative).** implements `Prover.prove(sealedPreimage, keyLocation)`
  + `check(...)`; `getProvingProvider`-shaped.
- **Dependencies.** FS-0.5 (Prover seam — extends its local proof-server
  client with sealing, ADR 0002). **Gate:** BCW; mockable with a local proof
  server.
- **Acceptance.** A sealed preimage yields a valid proof; `keyLocation` resolves
  BCW's cached key; the enclave key is pinned.
- **Verify.** `zkir-checker` / `sdk-tester` against a proof server; integration
  against BCW's TEE.
- **Tranches.** (1) `/prove` + `/check` client against a local proof server;
  (2) sealing to the enclave key; (3) BCW integration + key pinning.
- **Open questions.** Sealing scheme (HPKE vs RA-TLS) and enclave-key
  distribution (provider-integration §9).
- **Issue.** `#TBD`

## FS-1.5 — Settlement seam (BCW)

- **Objective.** DUST balancing + submission via BCW.
- **In scope.** `balanceUnsealedTransaction` (**DUST sponsored**, bind) +
  `submitTransaction` + await finalisation via the indexer.
- **Backing.** provider-integration §5.2–§5.3; requirements §3.11 (sponsored
  subset); beta-scope §2(3).
- **Surface (indicative).** implements `Settlement.balanceAndSubmit(unsealedTx)`
  + `awaitFinalised(txId)`.
- **Dependencies.** FS-0.6 (Settlement seam — this is its sponsored backend,
  beside the local one, ADR 0002). **Gate:** BCW (DUST sponsorship); mockable.
- **Acceptance.** An unsealed tx becomes sealed, fee-paid, submitted, and
  finalised for a zero-DUST user.
- **Verify.** `sdk-tester` submit + finalisation on devnet; integration against BCW.
- **Tranches.** (1) balance + submit client; (2) finalisation subscription;
  (3) BCW sponsorship integration.
- **Open questions.** DUST sponsorship mechanics/funding (provider-integration §9).
- **Issue.** `#TBD`

## FS-1.6 — `adapter-signer-local` (contingency fallback)

- **Objective.** The self-custody signer behind the same Signer seam, built as
  the contingency should the Dynamic signer gate slip
  ([ADR 0001](../../adr/0001-beta-includes-local-signer-fallback.md)).
- **In scope.** Passkey-PRF-derived device key with the local ceremony as the
  presence gate (requirements §2.1 decentralised, §2.2); implements the same
  Signer seam as FS-1.3, so onboarding swaps signers in one line (architecture
  §4.6, example 1); the interim hash-preimage signer behind the same interface
  until Jubjub Schnorr lands (§2.3). Ships **dark** — promoted to the beta
  onboarding path only at the activation checkpoint (beta-scope §5).
- **Out of scope.** Progressive decentralisation as the default path; §2.3
  external-identity binding; recovery.
- **Backing.** ADR 0001; [`beta-scope.md`](../../beta-scope.md) §2(2), §3;
  requirements §2.1–§2.3; architecture §4.4 (`adapter-signer-local`).
- **Surface (indicative).** implements `Signer.requestAuthorisation(bundle)`;
  a `passkeySigner()` factory.
- **Dependencies.** FS-0.4 (Signer seam), FS-1.2 (the flow it drops into). **Gate:**
  none on the provider (that is the point); the deployed ACC must verify the
  scheme the fallback signs (contract team — C5).
- **Acceptance.** FS-1.2's onboarding completes end-to-end with the local
  signer swapped in — same flow, same ACC, no provider involved.
- **Verify.** FS-1.2's e2e on devnet with `signer: passkeySigner()`; the swap
  itself is the test.
- **Tranches.** (1) device-key derivation + ceremony gate; (2) signer
  implementation + the one-line-swap e2e.
- **Open questions.** Interim hash-preimage vs Jubjub Schnorr at beta (§2.3;
  tracks the ACC verifier); the activation checkpoint date (beta-scope §5,
  verify register).
- **Issue.** `#TBD`
