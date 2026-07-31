# FS-0.1 — Monorepo scaffolding & workflow wiring

> **Status:** draft · 2026/07/29 · authored by `mn-passport-skills:spec-author` (dry run)
> **Milestone:** M0 — Foundations ([`roadmap.md`](../../roadmap.md) §2).
> **Brief:** [`M0-foundations.md`](../../milestones/M0-foundations.md) § FS-0.1.
> **Backing:** [`architecture.md`](../../../architecture.md) §4.1–§4.4,
> [`development-workflow.md`](../../../development-workflow.md), the repo README,
> [`beta-scope.md`](../../../beta-scope.md) §3, [`roadmap.md`](../../roadmap.md) §2–§3,
> and [ADR 0001](../../../adr/0001-beta-includes-local-signer-fallback.md).
> **GitHub issue:** [midnightntwrk/passport#50](https://github.com/midnightntwrk/passport/issues/50)
> (assigned 2026/07/29; OQ-1 resolved).

## 1. Objective

Stand up the TypeScript monorepo, the package skeletons, and the
`mn-passport-skills` workflow — the CI gate, `STATE.md`, and the `deps` /
`devenv` watchers — so every later spec has a home and a gate (brief). No
feature logic. No external gate: this starts now.

This is the first of M0's specs. Its exit contributes to the milestone
exit "`core` and `contract` build, a stub wiring compiles end-to-end, CI green"
(roadmap §2 M0); the ACC-artefact wiring is FS-0.2, and the kernel plus the
per-seam specs are FS-0.3–FS-0.8 (brief; ADR 0002; §6 below).

**Current state (updated 2026/07/29, post-`c7c9b9b`).** The workflow wiring —
the `mn-passport-skills` plugin (renamed from `mn-skills`),
`.github/workflows/pr-checks.yml`, `STATE.md`, and the `.mn-passport-skills/`
gitignore entry — is **landed on `main`** (commit `c7c9b9b`, 2026/07/29).
Tranche T3 therefore reduces to **CI activation** (build + test in the gate,
the gitignore backstop). No workspace or package code existed before T1 —
T1 and T2 are greenfield.

## 2. Scope

### In (brief, expanded)

- **Workspaces + build/test config** — the workspace root: root manifest and
  workspaces, a shared strict `tsconfig`, build and test scripts, format
  tooling, and the committed lockfile with exact pins (development-workflow §4).
- **Empty-but-typed package skeletons**, entrypoints exporting nothing yet
  (brief), for the beta slice (beta-scope §3; roadmap §3):

  | Directory | npm name |
  |---|---|
  | `packages/core` | `@midnight-ntwrk/mn-passport-core` |
  | `packages/protocol` | `@midnight-ntwrk/mn-passport-protocol` |
  | `packages/contract` | `@midnight-ntwrk/mn-passport-contract` |
  | `packages/connect` | `@midnight-ntwrk/mn-passport-connect` |
  | `packages/adapter-signer-managed` | `@midnight-ntwrk/mn-passport-adapter-signer-managed` |
  | `packages/adapter-signer-local` | `@midnight-ntwrk/mn-passport-adapter-signer-local` |
  | `packages/adapter-prover-remote` | `@midnight-ntwrk/mn-passport-adapter-prover-remote` |

  `adapter-signer-local` joined the beta slice on 2026/07/29 as the
  self-custody **contingency fallback** should the provider gate slip
  (beta-scope §2 item 2, ADR 0001).

  Each skeleton: a manifest carrying **only the dependency edges architecture
  §4.4 permits** (D-2), a `tsconfig.json`, an empty typed entrypoint
  (`export {}`). Shared root tests (dependency rules, wiring smoke) stand in
  for per-package placeholder tests until the packages carry logic; T2 also
  lands the `.npmrc` supply-chain posture (`save-exact`, `ignore-scripts`),
  closing two register entries on their recorded T2 trigger. The exact
  `adapter-*` set is OQ-4 (resolved: three adapters).
- **The dependency-boundary lint** — a lint rule that forbids
  `connect → core` imports (brief; architecture §4.4), plus the manifest-level
  edge check behind it.
- **The `mn-passport-skills` plugin present and auto-enabled** (via
  `.claude/settings.json`, per the README) — landed on `main`, 2026/07/29.
- **The CI gate** — `.github/workflows/pr-checks.yml` enforcing description +
  diff-size + gitignore + format/lint + the 7-day dependency cooldown (brief;
  development-workflow §4). The existing workflow already covers description,
  diff-size, cooldown, and format/lint; the **gitignore backstop** (no
  `.mn-passport-skills/` or register file ever tracked) is the one job still to
  add. Activating build + test on the new workspace rides the same job.
- **`STATE.md`** committed and current; **`.mn-passport-skills/` gitignored**
  (both landed on `main` — T3 adds the CI backstop that keeps the latter
  true).
- **The `deps` and `devenv` watchers** running on their own cadence
  (development-workflow §2 Watchers) — present via the plugin; T3 confirms
  they fire.

### Out

- **Any feature behaviour** (brief). No flow, proving, signing, or chain code.
- **ACC-artefact wiring and the binding-version pin** — FS-0.2. `contract` is
  an empty shell here.
- **The kernel skeleton and the seam interfaces with their dev backends** —
  FS-0.3 (kernel) and FS-0.4–FS-0.8 (one per seam, ADR 0002). `core` is an
  empty shell here.
- **Packages not in the beta slice** — `adapter-prover-wasm`,
  `adapter-agent-ows`, `adapter-wallet-connect`,
  `adapter-fee-capacity-exchange`, `adapter-node`, and the
  witness-provisioning half of the connector (beta-scope §3; roadmap §3).
- **The settlement-seam adapter** — needed in M1 but not yet named by the docs
  (roadmap §3: "`adapter-*` settlement seam"); see OQ-6.
- **Publishing / release machinery** — `mn-passport-skills:release` is
  explicitly deferred (development-workflow §2); all packages stay
  `"private": true`.

## 3. Decisions

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | **Node 22** is the toolchain baseline, recorded in a root `engines` field and `.nvmrc`. | CI pins `node-version: 22`; the repo should match its own gate. | `pr-checks.yml` |
| D-2 | Dependency edges are exactly the architecture §4.4 graph: `core → {contract, protocol}`; `connect → {protocol, contract}` **only**; each adapter `→ core`; `protocol` and `contract` depend on no workspace package. | "Everything points inward to `core`'s interfaces; nothing points outward"; `connect` never links `core` or an adapter, so a dApp can never pull the kernel into its bundle. | architecture §4.4 |
| D-3 | The `connect → core` prohibition is enforced by a **lint rule** (import-level), backed by a manifest-level edge check — committed, not conventional. | The brief names a lint rule; it is a normative MUST, and the deterministic layer guarantees what skills only judge. | brief; architecture §4.4; development-workflow §1 |
| D-4 | Entrypoints **export nothing yet** — no version constants, no types. The two version axes are respected structurally by the `protocol` / `contract` package split; `BINDING_VERSION` lands with FS-0.2's artefact pin, `PROTOCOL_VERSION` with the M2 wire types. | The brief says "exporting nothing yet"; seeding constants before their owning spec would freestyle values the docs have not set. | brief; architecture §4.6 |
| D-5 | `core` is **platform-neutral**: no `fs`, `window`, or `fetch`; platform code belongs to the platform adapters. | This is what keeps the kernel portable and unit-testable. | architecture §4.4 |
| D-6 | All dependencies are **exact-pinned**, versions verified with `npm view`, none younger than **7 days**, lockfile committed, no custom registry config. | Supply-chain cooldown quarantine; CI rejects violations. | development-workflow §2 (deps), §4 |
| D-7 | Ship as **ESM** (`"type": "module"`) with types built by `tsc` project references; no bundler at this stage. | Passport is browser-first (architecture §4.4); bundling is a publish-time concern deferred with the release skill. | architecture §4.4; development-workflow §2 |
| D-8 | The workflow wiring (plugin, CI gate, `STATE.md`, gitignore) landed on `main` ahead of the tranches (`c7c9b9b`, 2026/07/29); T3 verifies it and reduces to CI activation. | It matches the brief's scope; recreating it would be churn. | repo state; brief |
| D-9 | **pnpm** is the package manager (human decision, 2026/07/29, revising the T1 npm default in the same tranche): `pnpm-workspace.yaml` defines the workspace, `packageManager` pins `pnpm@10.33.0` (corepack), and `pnpm-lock.yaml` is the committed lockfile. The CI gate installs with `pnpm install --frozen-lockfile`, and the cooldown script reads pnpm lockfiles. Version *verification* stays `npm view` — a registry query, not an install tool. The yarn artefacts leave `.gitignore`; `engines` stays `">=22"` with **22 as the exercised baseline** (CI + `.nvmrc`). | One tool, one story across workspace file, lockfile, CI gate, and cooldown check. | `pr-checks.yml`; development-workflow §2 (deps), §4; **resolves OQ-2 (2026/07/29, at T1 as its route required)** |
| D-10 | Tests are **`.mjs` on `node:test`**, typechecked via `allowJs`/`checkJs` under the strict base config. A TypeScript test path is decided at T2 only if a test actually needs types. | Keeps the runner dependency-free and avoids relying on type-stripping the `>=22` floor does not guarantee. | D-9 (proposal defaults); Node 22 baseline |

Marked **[proposed — docs silent]**: the concrete tooling inside D-7 (no
bundler, `tsc -b`) and the test-runner choice (§8 leans on `midnight-cq` per
the brief). The workspace tool question (OQ-2) was
resolved at T1 — pnpm, per D-9.

## 4. Surface and interfaces

> Indicative shapes, per architecture §4.6's convention — finalised at
> implementation within these constraints.

**Workspace layout**

```
package.json            # packageManager: pnpm; scripts: build/test/lint/format:check
pnpm-workspace.yaml     # packages: [packages/*]  (D-9)
tsconfig.base.json      # strict, ESM, composite project references
packages/
  core/                 # shell; FS-0.3 (kernel) + FS-0.4–0.8 (seams) fill it
  protocol/             # shell; C23 wire types land in M2
  contract/             # shell; FS-0.2 wires the ACC artefact
  connect/              # deps: protocol, contract — NOTHING else
  adapter-signer-managed/
  adapter-signer-local/  # contingency fallback (ADR 0001)
  adapter-prover-remote/
tests/
  dependency-rules.test.mjs  # manifest-level assertion of the §4.4 graph (D-10)
mn-passport-skills/     # the plugin (landed on main in c7c9b9b)
.github/workflows/pr-checks.yml   # + gitignore-backstop job, build/test activation
STATE.md
```

**Package entrypoints** (every package, per the brief):

```ts
// src/index.ts — empty but typed; the compiler owns the file from day one
export {};
```

**Dependency-boundary enforcement** (two layers):

```jsonc
// lint rule (import-level): in packages/connect, any import matching
//   @midnight-ntwrk/mn-passport-core  or  @midnight-ntwrk/mn-passport-adapter-*
// is an error (architecture §4.4)
```

```ts
// tests/dependency-rules.test.ts (manifest-level)
const ALLOWED: Record<string, string[]> = {
  core: ['contract', 'protocol'],
  connect: ['protocol', 'contract'],
  'adapter-signer-managed': ['core'],
  'adapter-signer-local': ['core'],
  'adapter-prover-remote': ['core'],
  protocol: [],
  contract: [],
};
// fails on any @midnight-ntwrk/mn-passport-* edge not listed above,
// in dependencies OR peerDependencies
```

**CI gate** (target job set): `description` · `diff-size` ·
`dep-cooldown` · `build-lint-test` (lint, format, build, and test over the frozen lockfile) ·
`gitignore-backstop` (new: fails if `.mn-passport-skills/` or any register
file is tracked — development-workflow §4).

## 5. Flow

FS-0.1 performs no user-facing or chain-facing flow. Neither the provider nor
the proving & settlement service is involved — the first spec to touch
[`provider-integration.md`](../../../provider-integration.md) §3 is the M1 adapter
work. The only "flow" is the developer loop this spec establishes:

```
install (OQ-2 tool)  →  build (tsc -b)  →  test  →  lint / format:check
                     →  CI pr-checks (all jobs active)  →  watchers on cadence
```

## 6. Dependencies

**Internal:** none upstream (brief: "Dependencies: none"). Downstream, this
spec blocks:

- **FS-0.2 — ACC contract binding over the external artefact** (brief;
  roadmap §2 M0). Note its gate is the contract team's artefact; it starts
  against the prototype ACC.
- **FS-0.3 — Kernel & command/state skeleton**, and **FS-0.4–FS-0.8 — one
  spec per seam**, each with a provider-free dev backend (brief; roadmap §2
  M0; ADR 0002).

**External gates:** none (brief: "Gate: none"). Scaffolding needs no ACC
artefact, no provider, and no proving & settlement service; nothing here
waits, and nothing needs a mock (roadmap §4 gates only M1 integration).

**Toolchain dependencies to adopt** (all subject to D-6's cooldown and exact
pins; versions verified with `npm view` at implementation time, never from
memory): `typescript`, `@types/node`, and a formatter (no third-party linter — OQ-5). No
skeleton introduces a runtime dependency.

## 7. Acceptance criteria

From the brief, made observable:

1. **Build + test run green on the empty packages** — `install → build → test`
   succeeds on Node 22 from a clean checkout; all seven packages typecheck
   under the strict base config, and `core` imports no platform API (D-5).
2. **The CI gate runs** — every `pr-checks` job executes (none skip) on the
   tranche PRs themselves: description, diff-size, dep-cooldown, format/lint +
   build + test, and the gitignore backstop.
3. **`STATE.md` present** — committed, current, and updated as each tranche
   lands (development-workflow §3).
4. **The plugin loads** — `mn-passport-skills` auto-enables on trusting the
   repo (README), its skills resolve, and the `deps` / `devenv` watchers run.
5. **The boundary lint already forbids `connect → core`** — the lint rule
   errors on such an import, and demonstrably so: inject the illegal import
   once during review, observe the failure, revert (same for the
   manifest-level test).
6. **Supply-chain hygiene holds** — lockfile committed; every dependency
   exact-pinned and published ≥ 7 days before adoption; `dep-cooldown` green
   with no override marker.

## 8. Verify plan

What `mn-passport-skills:verify` drives for this spec (brief):

- **The test suite on the skeletons** — the shared root tests (workspace,
  dependency rules, wiring smoke) pass from a clean checkout on `node:test`
  (D-10; the brief's `midnight-cq` runner is deferred until the packages
  carry logic worth its harness).
- **Mutation check of the boundary** — add a `connect → core` import; lint
  must fail; revert.
- **CI-script dry run** — `check-diff-size.sh` against each tranche branch and
  `check-dep-cooldown.mjs` against the lockfile, locally, before `pr-open`.
- **`mn-passport-skills:devenv` doctor** — confirms HTTPS-local, devnet, the
  proof server, and the Compact CLI (brief), plus the private debts repo at
  `../mn-passport-sdk-debts` (development-workflow §2). Nothing in FS-0.1
  proves or submits, but the doctor run validates that the watcher wiring this
  spec lands actually works.
- **Mocks:** none — there is no unready external gate in this spec.
- **Register:** no `[PROVISIONAL]` items expected; if implementation surfaces
  one, it goes to the verify register per development-workflow §4.

## 9. Proposed tranches

The brief's three tranches, sized — a proposal for `spec-driver`'s plan phase,
not the final gated plan. Estimates exclude the lockfile and generated code
(development-workflow §2).

| # | Tranche (brief) | Contents | Estimate |
|---|---|---|---|
| T1 | **Monorepo + build/test** | root manifest + workspaces, `tsconfig.base.json`, formatter config, `.nvmrc`/`engines`, root scripts, lockfile | ~10 files, ≤ 200 net lines |
| T2 | **Package skeletons + the dependency-boundary lint** | seven package skeletons (manifest, tsconfig, `export {}` entrypoint); shared root tests (dependency rules + wiring smoke); the lint rule; the `.npmrc` posture | ~23 files, ≤ 380 net lines |
| T3 | **CI activation** (reduced — the plugin, `STATE.md`, and gitignore landed on `main` in `c7c9b9b`, D-8) | extend `pr-checks.yml`: run build + test in the gate, add the gitignore backstop (`.mn-passport-skills/` never tracked), drive Node from `.nvmrc` (`node-version-file`) | ~2 files, ≤ 100 net lines |

Each sits under the 400-line soft budget (the plugin rename that once
threatened T3's raw size landed separately on `main`, so T3 is small and
purely additive).

## 10. Respecting the normative MUSTs

| MUST | Status in FS-0.1 |
|---|---|
| Ceremony gate before witness use (requirements §2.2) | Not touched — no witness code exists; binds FS-0.3 / M1. Nothing here preempts it. |
| Encrypt the proof preimage to the enclave (§2.5) | Not touched — `adapter-prover-remote` is an empty shell; the rule binds its M1 implementation. |
| Deposit, not address (§3.12) | Not touched — deposits are out of beta entirely (beta-scope §4). |
| `connect` never links `core` (architecture §4.4) | **Actively encoded** — the boundary lint plus the manifest test (D-3) make violation a red build from day one. |
| Two version axes (§4.6) | **Structurally respected** — wire and binding concerns live in separate packages from the start; the constants land with FS-0.2 (binding) and M2 (wire), per D-4. |

## 11. Open questions

| # | Question | Route |
|---|---|---|
| OQ-1 | ~~GitHub issue~~ **Resolved 2026/07/29:** [midnightntwrk/passport#50](https://github.com/midnightntwrk/passport/issues/50), recorded here and in the brief. | Closed |
| OQ-2 | ~~Workspace tool~~ **Resolved 2026/07/29 at T1: pnpm (D-9)** — decided as npm at first, revised to pnpm by human decision within the same tranche. The yarn artefacts are dropped from `.gitignore`, so gate scripts, lockfile, and docs tell one story. | Closed (D-9) |
| OQ-3 | ~~Advisory diff-size threshold~~ **Resolved 2026/07/29 at T1: the 400/600 numbers stand.** T1's config-heavy diff landed well under the soft line (lockfile excluded by the gate), so scaffolding needs no special threshold; revisit only if an M0 tranche actually trips 400. | Closed |
| OQ-4 | ~~Exact `adapter-*` skeleton set~~ **Resolved 2026/07/29 at T2: three adapters** — `adapter-signer-managed`, `adapter-signer-local` (ADR 0001), and `adapter-prover-remote` (beta-scope §3). `adapter-browser` joins with its first real code in M1; roadmap §3 updated accordingly. | Closed |
| OQ-5 | ~~Linter choice for the boundary rule~~ **Resolved 2026/07/29 at T2 (recorded at T3): no third-party linter for now.** The boundary rule is a zero-dependency script (`scripts/lint-boundaries.mjs`, run as `pnpm lint`); the strict `tsconfig` and Prettier cover the rest at this code size. Revisit when the packages carry real logic (likely FS-0.3). | Closed |
| OQ-6 | **The settlement adapter is unnamed.** Roadmap §3 lists "`adapter-*` settlement seam" (M1) without a package name; FS-0.6 defines the Settlement seam interface, so the docs must name the adapter before its M1 spec. | `mn-passport-skills:doc-sync` before the M1 spec |
