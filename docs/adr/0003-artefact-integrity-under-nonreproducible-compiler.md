# 0003 — Artefact integrity under a non-reproducible compiler

Date: 2026/07/29 · Status: **superseded by
[ADR 0004](./0004-artefact-hashes-committed-compiler-deterministic.md)** —
the non-reproducibility finding was a false positive (a formatting artefact
in our own drift check); the compiler is deterministic and the committed
manifest carries the artefact hashes directly.
Refs: midnightntwrk/passport#50 · upstream decision: [midnightntwrk/passport#116](https://github.com/midnightntwrk/passport/issues/116)

## Context

FS-0.2 planned to pin the ACC artefact by committing content hashes of a
local compile of the prototype source (spec §2, following
provider-integration §5.1's "pin keys by a content hash tied to the verifier
key"). Implementation disproved the underlying assumption: **compiling the
same `account.compact` twice with the same toolchain (`compact` CLI 0.5.1,
compiler 0.31.1, language 0.23.0) produces different bytes** — the ZKIR, the
prover keys, and the verifier keys all differ between runs. Committed hashes
of a local compile would therefore be machine- and run-specific: any other
machine's rebuild would "drift" against them, and a CI recompile check can
never pass.

## Decision

Split the pin by what is actually deterministic:

- **The committed manifest** (`packages/contract/src/manifest.generated.ts`)
  pins the reproducible facts: `BINDING_VERSION`, the **source hash** of
  `account.compact`, the **toolchain versions** from `contract-info.json`,
  and the **circuit table** (name, purity, provability, `keyLocation`).
- **Per-file content hashes** of the compiled artefact live in a
  **gitignored sidecar** (`packages/contract/artefact/integrity.local.json`)
  written at compile time. The loader verifies the artefact directory
  against the sidecar — every consumed byte: ZKIR (text and binary), both
  keys, the generated module, and `contract-info.json` — surfacing
  `ZkArtifactIntegrityError` (T3). This catches **accidental corruption,
  stale mixes, and partial rebuilds**; it is **not a tamper control** — the
  sidecar sits beside the bytes it describes and is self-attesting. Genuine
  tamper resistance arrives with the published hashes.
- **When the contract team publishes the real artefact**, its authoritative
  published hashes replace the sidecar and are committed into the manifest —
  that is the genuine §5.1 integrity pin, hashing bytes as *distributed*,
  not as *recompiled*. Until then the prototype pin stays `[PROVISIONAL]`
  (verify register).

## Consequences

- `scripts/build-acc-artefact.mjs --check` verifies the on-disk artefact
  against the committed manifest and the sidecar **without recompiling**;
  "recompile and compare" is not a meaningful check and was removed. It is
  a developer-invoked command — CI has neither the artefact nor the
  toolchain; the test suite performs the same sidecar verification whenever
  the artefact is present locally.
- provider-integration §5.1 needs no change — its hash-pinning language
  applies to the published artefact, which remains the target state. The
  FS-0.2 spec is corrected to say which hashes are committed when.
- Proof provenance across machines cannot rely on artefact-byte equality;
  the binding axis (`BINDING_VERSION` + source hash + toolchain) is the
  shared identity of "which contract", while byte-level integrity is local
  until publication.
- The non-reproducibility itself is raised upstream as
  [midnightntwrk/passport#116](https://github.com/midnightntwrk/passport/issues/116) — the decision request for published,
  versioned, hash-attested artefacts. **Interim stance (human decision,
  2026/07/29):** the SDK is in its development phase, so work proceeds on
  the provisional pin; integrity enforcement beyond the local sidecar is
  deferred, and the loader's published-hash verification path is stubbed
  until #116 resolves.
