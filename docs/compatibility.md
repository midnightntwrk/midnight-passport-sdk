# Compatibility matrix

> **Status:** live · reset 2026/10/19 (no package is scaffolded yet)
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
| dev (unreleased) | None | Set when `mn-passport-protocol` lands |

## Binding axis

| SDK | ACC binding | Compact CLI | Compiler | Language | Runtime (`@midnight-ntwrk/compact-runtime`) | Status |
|---|---|---|---|---|---|---|
| dev (unreleased) | None | | | | | Set when `mn-passport-contract` lands |

The runtime column must equal the runtime version that the binding records.

## Toolchain pins

Proving keys change with the exact crate revision, not with the version
string ([`provider-integration.md`](./provider-integration.md), "Proving
keys"). Thus, the matrix records the revisions, not only the versions.

| Component | Pin | Why |
|---|---|---|
| midnight-js | None yet | One version for the whole build, with the behavior it uses |
| zkir crate | None yet | The prover must use the same revision to make the same keys |
| midnight-zk crate | None yet | Same as zkir |
