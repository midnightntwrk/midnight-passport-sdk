# 0007 — Package names: `owner` and `core`, and a shared WPP client

Date: 2026/11/05 · Status: proposed
Refs: architecture, sections "Packages", "Seams", "Adapters", and "The owner
kernel invariant"

## Context

The architecture named the Passport app library `mn-passport-core` and the
shared ACC client `mn-passport-account`. "Core" reads as the base layer that
every package consumes. In this SDK the base layer is the shared ACC client,
and the Passport app library is the opposite: a top-level package that only
the Passport app uses, and the only one that holds owner keys. The names
pointed readers the wrong way.

WPP had the same kind of mismatch. The storage seam and `adapter-storage-wpp`
were Passport-app only, behind `core`. A dApp also uses WPP: after the
handoff, `connect` reads and writes the WPP package of the dApp through a
private-state provider. So the WPP client is shared code, and the dependency
rules say shared code goes into the foundation.

## Decision

1. **`mn-passport-core` becomes `mn-passport-owner`.** It is the Passport app
   library: the kernel, the owner keys, and the owner ceremonies (deploy,
   devices, grants, recovery). The kernel invariant is now "the owner kernel
   invariant".
2. **`mn-passport-account` becomes `mn-passport-core`.** It is the shared ACC
   client that `owner`, `connect`, and `mn-passport-agent` all use.
3. **The WPP client moves into `mn-passport-core`.** It holds the package
   format, the encryption, the entry integrity checks, and the private-state
   provider. It defines the storage seam. It works with one package key that
   it was given, and it never receives, derives, or stores the WPP account
   key.
4. **The account key stays in `owner`.** Only the owner kernel holds the WPP
   account key and derives package keys. The handoff gives a dApp the key of
   its own package only.
5. **One adapter per storage backend.** Storage adapters follow the pattern
   `adapter-wpp-<backend>`, each a shared adapter that implements the storage
   seam of `mn-passport-core`, so an app loads only the backend it uses.
   `adapter-storage-wpp` becomes `adapter-wpp-drive`, the first one.

The rule "`connect` and `mn-passport-agent` never link `owner`" (requirements,
rule 4) keeps its meaning under the new name.

## Consequences

- `docs/architecture.md`, `docs/sdk-requirements.md`,
  `docs/provider-integration.md`, `docs/development-workflow.md`,
  `README.md`, `CLAUDE.md`, and the `conformance`, `security-audit`, and
  `spec-author` skills use the new names.
- The package map moves to `docs/assets/sdk-packages.svg` with the new names
  and the `adapter-wpp-<backend>` adapters. The realignment proposal keeps its original map.
- ADRs 0001 to 0006 and the dated proposals keep the old names, because they
  are records. In them, `core` means `owner` and `mn-passport-account` means
  `mn-passport-core`.
- The conformance lens checks that the WPP client in `mn-passport-core` never
  handles the WPP account key.
- `scripts/dependency-graph.mjs` and its tests use the new names, and list
  `adapter-wpp-drive` as a shared adapter.
- Closed 2026/11/09: agents use WPP
  ([ADR 0008](./0008-agents-get-private-data-through-a-sealed-handoff.md)).
- Open, and a blocker before this ADR is accepted: the `drive.file` scope.
  Under it, an OAuth client sees only the files that it created or that the
  user opened with it. A dApp is a different client from the Passport app, so
  it may not read a package that Passport wrote. A spike must confirm this and
  pick a fix: the dApp writes its package under its own client after the
  handoff, the user grants the file to the dApp through the Google Picker, or
  a different storage design.
