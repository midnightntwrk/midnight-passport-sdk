# Compatibility matrix

> **Status:** live · updated 2026/11/17
> **Owns:** the two version axes of the SDK, and the toolchain that each
> binding uses.
> **Maintained by:** `mn-passport-skills:deps`. A row changes only through a
> reviewed PR.

## Summary

- The **wire axis** is the version of the protocol messages between a dApp or
  an agent and Passport. `mn-passport-protocol` owns it (`PROTOCOL_VERSION`).
- The **binding axis** is the range of deployed ACC versions that
  `mn-passport-contract` supports.
- The two axes never move together by implication. A wire change does not
  change the binding, and a binding change does not change the wire
  ([`sdk-requirements.md`](./sdk-requirements.md), rule 5).
- A bump that moves an axis or a toolchain pin updates this file in the same
  PR.

## Wire axis

| SDK | `PROTOCOL_VERSION` | Status |
|---|---|---|
| dev (unreleased) | 2.0 | First wire version (major.minor). Only a higher major is refused; the full rule is E09.04. |

## Binding axis

| SDK | ACC binding | Compact CLI | Compiler | Manifest hash | Origin length | Language | Runtime (`@midnight-ntwrk/compact-runtime`) | Status |
|---|---|---|---|---|---|---|---|---|
| dev (unreleased) | None | — | — | — | — | — | — | Placeholder. Pending the first ACC build (E05.01). |

The `Compiler`, `Manifest hash`, and `Origin length` columns are the three
fields of `BindingVersion` (`mn-passport-contract`). The manifest hash commits
to the per-file artifact hashes, including the verifier keys. A build for
another origin length has other verifier keys and other addresses.

The runtime column must equal the runtime version that the binding records.

## Toolchain pins

Proving keys change with the exact crate revision, not with the version
string ([`provider-integration.md`](./provider-integration.md), "Proving
keys"). Thus, the matrix records the revisions, not only the versions.

| Component | Pin | Why |
|---|---|---|
| Compact toolchain | 0.36.1 | 0.36.1 fixes a key-generation crash for `JubjubScalar` and `JubjubPoint` |
| `@midnight-ntwrk/compact-runtime` | 0.21.0 | The runtime of Compact 0.36. midnight-js 5.0.1 requires exactly 0.21.0 |
| midnight-js (`@midnight-ntwrk/midnight-js`) | 5.0.1 | One version for the whole build, with the behavior it uses |
| `@midnight-ntwrk/compact-js` | 3.0.2 | midnight-js 5.0.1 requires exactly 3.0.2 |
| `@midnight-ntwrk/platform-js` | 3.0.0 | midnight-js 5.0.1 requires exactly 3.0.0 |
| `@midnightntwrk/ledger-v9` | 1.0.2 | midnight-js 5.0.1 requires exactly 1.0.2. ledger-v9 1.0.0 prices some calls lower than the node does (error 138) |
| Proof server | 9.0.2 | The prover must match the ledger version of the build (ledger 9.1.0.2) |
| `effect` (Effect 4) | 4.1.3 | The SDK will bundle Effect 4. midnight-js keeps its own Effect 3 |
| zkir crate | None yet | The prover must use the same revision to make the same keys |
| midnight-zk crate | None yet | Same as zkir |

Compact and the proof server are not npm packages. Their rows are not in the
lockfile. The other npm rows are exact pins in the root `package.json`, except
ledger-v9, which comes through midnight-js. The lockfile must agree.

`pnpm run lint` runs `scripts/check-single-copy.mjs`. It fails when the
lockfile has two versions of ledger-v9, `compact-js`, `compact-runtime`, or
Effect 3. ledger-v9 counts once for its two scopes, `@midnightntwrk` and
`@midnight-ntwrk`. One second `compact-runtime` is allowed: midnight-js 5.0
installs 0.16.0 as `compact-runtime-ledger8`, for ledger 8 contracts.
