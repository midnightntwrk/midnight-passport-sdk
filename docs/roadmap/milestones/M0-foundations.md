# M0 — Foundations (feature specs)

> Scaffolding and the workflow so every later spec has a home and a gate. No
> product feature logic — but each seam ships a **provider-free dev backend**
> wired to the local environment (dev signer key, local proof server, devnet
> settlement), per architecture §4.2 / [P8] and
> [ADR 0002](../../adr/0002-m0-per-seam-specs-with-dev-defaults.md). No
> external gate — **this can start now.**
> Backing: [`architecture.md`](../../architecture.md) §4.1–§4.4,
> [`development-workflow.md`](../../development-workflow.md), the repo README.

## FS-0.1 — Monorepo scaffolding & workflow wiring

- **Objective.** Stand up the TS monorepo, the package skeletons, and the
  `mn-passport-skills` workflow (CI gate, `STATE.md`, watchers).
- **In scope.** Workspaces + build/test config; empty-but-typed skeletons for
  `mn-passport-core`, `-protocol`, `-contract`, `-connect`, and the `adapter-*`
  dirs; the `mn-passport-skills` plugin present and auto-enabled;
  `.github/workflows/pr-checks.yml`; `STATE.md`; `.mn-passport-skills/`
  gitignored; the `deps` and `devenv` watchers.
- **Out of scope.** Any feature behaviour.
- **Surface.** Root `package.json` workspaces; shared `tsconfig`; five package
  entrypoints exporting nothing yet; the CI gate enforcing description +
  diff-size + gitignore + format/lint + 7-day dependency cooldown.
- **Dependencies.** None. **Gate:** none.
- **Acceptance.** Build + test run green on empty packages; CI gate runs;
  `STATE.md` present; the plugin loads; a lint rule already forbids
  `connect → core` imports (architecture §4.4).
- **Verify.** `midnight-cq` test runner on the skeletons;
  `mn-passport-skills-devenv` doctor confirms HTTPS-local, devnet, proof server,
  and the compact CLI.
- **Tranches.** (1) monorepo + build/test; (2) package skeletons + the
  dependency-boundary lint; (3) `mn-passport-skills` plugin + CI gate +
  `STATE.md` + gitignore.
- **Open questions.** Workspace tool (confirm yarn vs pnpm against the README);
  the advisory diff-size threshold.
- **Issue.** [midnightntwrk/passport#50](https://github.com/midnightntwrk/passport/issues/50)

## FS-0.2 — ACC contract binding over the external artefact

- **Objective.** Consume the externally-owned ACC artefact as a typed, version-
  pinned binding with artefact-integrity.
- **In scope.** `mn-passport-contract` wraps the compiled ACC circuit + ZKIR +
  verifier key + `keyLocation`; typed callers for the circuits beta needs
  (deploy — claim-name deferred: no C2 artefact exists yet, see the spec's
  OQ-4); a pinned binding version; drift detection
  (`ZkArtifactIntegrityError` surfaced).
- **Out of scope.** dApp-contract bindings; ACC circuits beyond onboarding.
- **Backing.** requirements §1.1 (ACC); architecture §4.4 (contract package is
  externally owned), §4.6 (binding version axis); provider-integration §6
  (artefacts), §5.1 (challenge inputs); beta-scope §3.
- **Surface.** Typed circuit callers + the ZK-config references; the pinned
  artefact version and its integrity hash.
- **Dependencies.** FS-0.1. **Gate:** contract team (a deployed/compiled ACC
  artefact). Start against the prototype ACC (`experiments/account-custody-prototype`).
- **Acceptance.** Resolves the ACC artefact, exposes the typed deploy
  caller (claim-name deferred — spec OQ-4), and fails loudly on version
  drift.
- **Verify.** Compile the ACC artefact; type-check the binding; force a key
  mismatch and confirm the integrity error fires.
- **Tranches.** (1) artefact ingestion + ZK-config wiring + version pin;
  (2) the typed deploy caller (claim-name deferred); (3) drift/integrity
  check.
- **Open questions.** The artefact host (where prover/verifier keys + ZKIR are
  served); the exact ACC version pinned for beta.
- **Issue.** [midnightntwrk/passport#50](https://github.com/midnightntwrk/passport/issues/50) (reused from FS-0.1)

## FS-0.3 — Kernel & command/state skeleton

- **Objective.** The kernel secret boundary and the staged command/state
  pipeline, plus the composition point adapters plug into.
- **In scope.** Kernel stubs — ACC session, ceremony gate, witness lifecycle,
  private-state envelope (typed structure, stub crypto); the command pipeline
  (authorise → build → prove → submit → confirm) emitting an event per stage
  (proof provenance included); a reads-projection stub;
  `Passport.create({ signer, prover, settlement, storage, platform })`.
- **Out of scope.** The seam interfaces themselves and their dev backends
  (FS-0.4–FS-0.8); adapter implementations (M1); real witness/crypto logic.
- **Backing.** architecture §4.1 (kernel), §4.3 (command + state), §5;
  requirements §2.2, §2.5 (provenance); ADR 0002.
- **Surface (indicative).** `Passport.create(seams)`; `CommandEvent` stream
  per stage.
- **Dependencies.** FS-0.1; the interface tranche of FS-0.4–FS-0.8.
  **Gate:** none.
- **Acceptance.** `core` builds with the stub kernel; `Passport.create`
  composes the five seam mocks; one stub command emits the full ordered event
  sequence.
- **Verify.** Unit tests driving the pipeline through the seam mocks
  (`midnight-cq`).
- **Tranches.** (1) kernel stubs; (2) pipeline + events + composition;
  (3) pipeline tests over the mocks.
- **Open questions.** The command-bus shape (Approach-3 promotion path).
- **Issue.** `#TBD`

## FS-0.4 — Signer seam & dev signer

- **Objective.** The authoriser-signing seam plus a provider-free **dev
  signer** so local flows sign without any provider.
- **In scope.** `Signer.requestAuthorisation(bundle) → { R, s, scheme }`
  (bundle = account, circuit tag, args, `auth_nonce`); a mock; a **dev signer**
  holding an in-memory per-account test key (JubJub Schnorr, C5); the private
  `packages/dev` workspace package (ADR 0002).
- **Out of scope.** The managed adapter (FS-1.3); the self-custody passkey
  adapter (FS-1.6, ADR 0001); provider policy and recovery.
- **Backing.** provider-integration §4.1; architecture §4.2; requirements
  §2.1, §2.3; ADR 0001, ADR 0002.
- **Local dev.** No external service; the dev key is registered on the local
  prototype ACC so signatures verify in-circuit on devnet.
- **Dependencies.** FS-0.1. **Gate:** none.
- **Acceptance.** Mock and dev signer both satisfy the seam; a dev signature
  verifies (`s·G == R + c·pk`) against the test key.
- **Verify.** Signature verification against the test key; seam-conformance
  test shared by all Signer implementations.
- **Tranches.** (1) interface + mock; (2) dev signer + `packages/dev`.
- **Open questions.** Dev scheme vs the prototype ACC's interim hash-preimage
  seam (tracks FS-0.2's artefact).
- **Issue.** `#TBD`

## FS-0.5 — Prover seam & local proof server

- **Objective.** The proving seam plus a dev prover that drives the **local
  proof server** the `devenv` skill already gates.
- **In scope.** `Prover.prove(preimage, keyLocation) → proof` + `check`; a
  preimage-envelope type that carries the sealing mode; a mock; a **dev
  prover**: HTTP client (`application/octet-stream`) to the local proof
  server, **loopback-only guard** for its cleartext dev mode.
- **Out of scope.** Sealing to the enclave key and the remote service
  integration (FS-1.4 — which extends this client); the k-threshold router
  (post-beta).
- **Backing.** provider-integration §5.1; architecture §4.2.1; requirements
  §2.5; beta-scope §2(3); ADR 0002.
- **Local dev.** The `devenv` proof server; ZK config / `keyLocation` resolved
  locally from FS-0.2's artefact.
- **Dependencies.** FS-0.1, FS-0.2. **Gate:** none.
- **Acceptance.** The dev prover produces a valid proof for a prototype-ACC
  circuit against the local proof server; cleartext mode refuses any
  non-loopback endpoint.
- **Verify.** A local end-to-end prove of a small circuit; the loopback-guard
  mutation test.
- **Tranches.** (1) interface + envelope + mock; (2) local proof-server client
  + guard; (3) local prove e2e test.
- **Open questions.** Envelope shape vs the stock proof-server API; the
  upstream sealing scheme (provider-integration §9).
- **Issue.** `#TBD`

## FS-0.6 — Settlement seam & simple local settlement

- **Objective.** The settlement seam plus **simple local settlement**:
  user-held DUST on devnet — no sponsorship, no provider.
- **In scope.** `Settlement.balanceAndSubmit(unsealedTx) → txId` +
  `awaitFinalised(txId)`; a mock; a **dev settlement** backend: balance with
  DUST from a funded devnet account, submit via the local node, await
  finalisation via the local indexer.
- **Out of scope.** Sponsored settlement via the proving & settlement service
  (FS-1.5 — an alternative backend of this seam); the Capacity Exchange
  (post-beta).
- **Backing.** provider-integration §5.2–§5.3; architecture §4.2 (fee seam —
  user-held DUST is the provider-free default); ADR 0002.
- **Local dev.** Devnet node + indexer (`devenv`); a funded dev account.
- **Dependencies.** FS-0.1; FS-0.5 (a proven tx to settle in the e2e test).
  **Gate:** none.
- **Acceptance.** A locally proven tx becomes balanced, submitted, and
  finalised on devnet with user-held DUST.
- **Verify.** Devnet submit + finalisation (`sdk-tester`).
- **Tranches.** (1) interface + mock; (2) dev balance + submit;
  (3) finalisation + local e2e.
- **Open questions.** The midnight-js balancing API for user-held DUST;
  whether finalisation-watching makes the indexer a sixth seam or stays
  inside Settlement.
- **Issue.** `#TBD`

## FS-0.7 — Storage seam & dev store

- **Objective.** The ciphertext-at-rest seam plus an in-memory / file-backed
  dev store.
- **In scope.** `Storage.get/put` over `{ version, nonce, ciphertext }`
  entries, keyed per account/context; a mock; a **dev store** (in-memory, and
  file-backed for persistence across local runs). Ciphertext-only by type.
- **Out of scope.** Browser IndexedDB (rides `adapter-browser`); vendor
  keystore and the shared #58 provider (post-beta); backup-tier logic; key
  derivation (the envelope is the kernel's, FS-0.3).
- **Backing.** architecture §4.5 (ciphertext model, tiers); requirements §3.6;
  ADR 0002.
- **Local dev.** Nothing external; the file-backed store keeps dev state
  across restarts.
- **Dependencies.** FS-0.1. **Gate:** none.
- **Acceptance.** Both backends round-trip entries; the seam's types admit no
  plaintext field.
- **Verify.** Round-trip + persistence tests; the shared seam-conformance
  test.
- **Tranches.** (1) interface + mock; (2) dev store + tests.
- **Open questions.** Entry keying scheme (per account/context granularity).
- **Issue.** `#TBD`

## FS-0.8 — Platform seam & HTTPS-local dev posture

- **Objective.** The platform-wiring seam (browser target) plus the local
  secure-context posture passkeys require.
- **In scope.** The `Platform` interface — network primitives (fetch,
  WebSocket) and the ceremony-primitive hooks (WebAuthn PRF shape) `core`
  consumes without touching platform globals; a Node test shim; the
  HTTPS-local requirement documented and checked (`devenv`).
- **Out of scope.** `adapter-browser`'s real implementation (roadmap §3,
  M0–M1); `adapter-node` (out of beta).
- **Backing.** architecture §4.4 (platform adapters), §8.5;
  development-workflow §2 (`devenv`: HTTPS-local); ADR 0002.
- **Local dev.** HTTPS-local secure context (passkeys refuse plain-HTTP
  localhost redirects); `devenv` doctor asserts it.
- **Dependencies.** FS-0.1. **Gate:** none.
- **Acceptance.** `core` builds against `Platform` with no platform globals;
  the shim satisfies the seam in tests; `devenv` doctor green on HTTPS-local.
- **Verify.** Boundary lint (no `fetch`/`window` in `core`); shim-driven
  tests; the doctor run.
- **Tranches.** (1) interface + shim; (2) ceremony-primitive hooks + dev
  posture docs.
- **Open questions.** The Platform ↔ ceremony-gate split (which side owns the
  WebAuthn call); the PRF hook shape.
- **Issue.** `#TBD`
