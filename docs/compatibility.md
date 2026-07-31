# Compatibility matrix

> **Status:** live · started 2026/07/29 (first external Midnight dependency)
> Maintained by `mn-passport-skills:deps` (development-workflow §2): the two
> version axes of architecture §4.6 — **wire** (`mn-passport-protocol` ↔
> dApp connectors) and **binding** (`mn-passport-contract` ↔ deployed ACC)
> — plus the toolchain each binding was produced with. A row changes only
> through a reviewed PR.

## Binding axis

| SDK | ACC binding | Compact CLI | Compiler | Language | Runtime (`@midnight-ntwrk/compact-runtime`) | Status |
|---|---|---|---|---|---|---|
| dev (unreleased) | `0.0.0-prototype.1` `[PROVISIONAL]` | 0.5.1 | 0.31.1 | 0.23.0 | **0.16.0** (root devDependency, exact pin) | prototype — re-pinned when [passport#116](https://github.com/midnightntwrk/passport/issues/116) delivers publisher versioning |

The runtime column must equal the binding's recorded
`toolchain.runtimeVersion` (`packages/contract/acc-versions.generated.json`)
— a test asserts the agreement (`tests/contract-deploy.test.mjs`). If two
supported bindings ever require different runtime majors, that is a
compatibility event this matrix must resolve before the second binding is
adopted (spec D-8).

## Wire axis

| SDK | `PROTOCOL_VERSION` | Status |
|---|---|---|
| dev (unreleased) | — | lands with the M2 wire types (FS-0.1 D-4) |
