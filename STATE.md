# STATE — Midnight Passport SDK

> The committed record of SDK development, maintained by
> `mn-passport-skills:spec-driver` per [`docs/development-workflow.md`](./docs/development-workflow.md) §3.
> Every entry carries its GitHub issue
> ([midnightntwrk/passport](https://github.com/midnightntwrk/passport/issues)).
> Last updated: 2026/07/30.

## Done

- **Workflow wiring** (#50) — the `mn-passport-skills` plugin (renamed from
  `mn-skills`), the CI gate, `STATE.md`, and the `.mn-passport-skills/`
  gitignore entry, landed directly on `main` in `c7c9b9b` (2026/07/29) ahead
  of the FS-0.1 tranches; T3 adds the CI backstop on top.
- **FS-0.1 · T1 — workspace root** (#50 ·
  [PR #2](https://github.com/hbulgarini/mn-passport-sdk/pull/2), merged
  2026/07/29) — pnpm workspaces (spec D-9, pnpm@10.33.0 via corepack), the
  strict base `tsconfig`, Prettier, the Node 22 baseline, root scripts, and
  the exact-pinned committed lockfile; the CI gate and cooldown script speak
  pnpm.

- **FS-0.1 · T2 — package skeletons + dependency-boundary lint** (#50 ·
  [PR #3](https://github.com/hbulgarini/mn-passport-sdk/pull/3), merged
  2026/07/29) — the seven `packages/*` skeletons, two-layer boundary
  enforcement over one shared graph module (import-level lint including
  dynamic `import()` and `core` platform-neutrality; manifest + tsconfig
  test with transitive `connect → core` closure), the wiring smoke test,
  and the `.npmrc` posture (`save-exact`, `ignore-scripts`).

- **FS-0.1 · T3 — CI activation** (#50 ·
  [PR #4](https://github.com/hbulgarini/mn-passport-sdk/pull/4), merged
  2026/07/29) — the full gate (lint, format, build, test), the
  `gitignore-backstop` job, Node driven from `.nvmrc`, actions pinned by
  commit SHA. **FS-0.1 complete: issue #50 tranches 1–3 merged.**

- **FS-0.2 · T1 — artefact ingestion + committed binding pin** (#50 ·
  [PR #5](https://github.com/hbulgarini/mn-passport-sdk/pull/5), merged
  2026/07/29) — `build:artefact` compiles the prototype ACC into the
  gitignored artefact directory; the committed manifest pins the binding
  with per-file content hashes (ADR 0004 — compilation is deterministic;
  ADR 0003's contrary finding was a false positive, corrected);
  [passport#116](https://github.com/midnightntwrk/passport/issues/116)
  rewritten as the versioning-ownership decision.
- **FS-0.2 · T1.5 — multi-version binding registry** (#50 ·
  [PR #6](https://github.com/hbulgarini/mn-passport-sdk/pull/6) docs +
  [PR #7](https://github.com/hbulgarini/mn-passport-sdk/pull/7), merged
  2026/07/29 — #7's stacked branch carried both the tooling + data layer
  and the resolution surface, so the planned third PR was subsumed) —
  `acc-versions.generated.json` (every supported version, `current`
  pointer, provenance keys) with its tested TypeScript mirror; per-version
  artefacts; `--pin`/`--current`/`--force` and `--check` (recompile
  determinism for `current`); `resolveBinding`, `SUPPORTED_BINDINGS`,
  `UnsupportedBindingError`, `detectDeployedVersion`, the deep-frozen
  registry (reshaped per PR #7 review), and the platform-neutrality lint
  over every bundle-bound package. Which version an account uses is
  kernel-owned metadata (spec §4.1); the upgrade path stays deferred
  (roadmap §8).

- **FS-0.2 · T2 — typed deploy caller** (#50 ·
  [PR #8](https://github.com/hbulgarini/mn-passport-sdk/pull/8), merged
  2026/07/30) — `buildDeployArgs` shapes
  the ACC constructor call (ordered commitments, version-gated by
  `assertBindingCompatible`, the §8.2 connect-time guard);
  `bindAccModule` gives structural typing over the runtime-loaded
  generated module (`AccModuleShapeError`; shape check only — byte
  integrity is T3's) — the committed package stays dependency-free
  because the generated module needs `@midnight-ntwrk/compact-runtime`,
  added as a root devDependency (0.16.0, exactly the artefact's recorded
  runtime version, past cooldown; first entry in
  `docs/compatibility.md`). The spec's "pure-commitment re-exports"
  became this structural mirror + binder (spec D-9, closing OQ-5). Review
  hardening rode the PR: fully typed witnesses/instance surface, PS
  inferred at the construction site, and the maximise-typing rule
  recorded (code-style skill + CLAUDE.md).

## In progress

- **FS-0.2 · T3 — loader integrity** (#50) — `loadArtefact(source)`:
  platform-neutral (byte source injected — fetch in browsers, fs in
  tests; Web Crypto hashing), verifying every fetched byte against the
  committed registry hashes before returning; `ZkArtifactIntegrityError`
  and `UnknownCircuitError` join the taxonomy with stable codes; prover
  keys load only on explicit request (dev-local proving, FS-0.5). The
  host-runtime execution gap is documented at the loader and stays a
  register item (revisit at `adapter-browser`). Finishes FS-0.2's
  plannable scope — claim-name stays blocked on the C2 gate. Branch
  `feat/fs-0.2-t3-loader`.

## Backlog

- **FS-0.2 · claim-name caller** (#50) — **blocked**: the prototype has no
  name circuit and the C2 name-service artefact does not exist yet (spec
  OQ-4, human decision 2026/07/29). Resumes when the contract team
  publishes C2.
- **FS-0.3–FS-0.8** (`#TBD`) — authored specs in
  [`docs/roadmap/specs/M0-Foundations/`](./docs/roadmap/specs/M0-Foundations/);
  not planned — each still needs its GitHub issue (no issue, no plan).
