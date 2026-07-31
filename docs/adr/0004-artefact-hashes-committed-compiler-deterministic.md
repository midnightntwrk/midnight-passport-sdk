# 0004 — Compilation is deterministic after all: commit the artefact hashes

Date: 2026/07/29 · Status: accepted · Supersedes: ADR 0003
Refs: midnightntwrk/passport#50 ·
[midnightntwrk/passport#116](https://github.com/midnightntwrk/passport/issues/116)
(amended — see Consequences)

## Context

ADR 0003 recorded a T1 verify finding that the Compact compiler is not
reproducible — identical compiles allegedly yielding different ZKIR and key
bytes — and designed a two-tier integrity model around it (deterministic
facts committed; per-file hashes in a gitignored, self-attesting sidecar).

A follow-up investigation disproved the finding. **The observation was a
tooling artefact of our own making**: the drift check compared the
*generated manifest text* against the *committed manifest text* after
Prettier had reformatted the committed file (JSON quoting → house style),
and the "confirmation" diffed grep'd hash *lines* across those two
formatting states — never the hash values, never the compiled files.
Re-examination showed all 36 recorded hash values identical across the
supposedly drifting manifests, and the compiled artefacts of the first and
fifth compiles (~40 minutes apart) **byte-identical across all 48 files**.

**Corrected finding:** `compact compile` is deterministic for a given
source and toolchain, at least within one machine (CLI 0.5.1, compiler
0.31.1, language 0.23.0, Linux x86-64, verified over five compiles).
Cross-machine reproducibility is expected but untested — one open
validation, not a design driver.

## Decision

Revert to the spec's original, simpler, stronger integrity model:

- **Per-file content hashes are committed in the binding manifest** —
  every provable circuit's ZKIR (text and binary), verifier key, and
  prover key, plus the generated module and `contract-info.json`. Anyone
  with the source and toolchain can recompile and independently confirm
  the committed hashes; the source → bytes chain is auditable after all.
- **The gitignored integrity sidecar is removed.** Its job (accident
  detection) is subsumed: the test suite verifies the local artefact
  against the *committed* hashes whenever the artefact is present, which
  is also genuine tamper evidence — the pin lives in reviewed git history,
  not next to the bytes.
- **`--check` recompiles and compares** — meaningful again under
  determinism: it re-derives the manifest from a fresh compile and fails
  on any divergence (source, toolchain, circuit table, or bytes).
- The pin remains `[PROVISIONAL]` over the prototype until the contract
  team publishes an official versioned artefact; published hashes then
  replace or confirm ours (the `publishedHashes` slot is dropped — the
  committed hashes are the pin, whatever their origin).

## Consequences

- ADR 0003 is superseded; its interim stance (develop on the provisional
  pin) survives, its sidecar machinery does not.
- **Issue #116 is rewritten, not merely corrected**: its headline claim
  and reproduction were wrong, and the human decision (2026/07/29) is to
  replace the body entirely with the real decision it was circling — **who
  versions and publishes the ACC artefact: the contract repository, or
  each SDK release** — with the pros and cons of both paths documented
  and the SDK's lean recorded (contract-repo ownership as the decision,
  today's SDK-side pin as the explicit interim). The replacement body is
  drafted for the human to post.
- The verify and security registers are corrected: the "severed
  source → bytes chain" and "self-attesting sidecar" entries dissolve;
  a narrow "cross-machine reproducibility untested" validation replaces
  them.
- Process lesson, recorded deliberately: **a failing integrity check must
  be verified against the underlying bytes before it becomes a finding.**
  The false positive cost an ADR, five register entries, and an upstream
  issue; the correction cost one byte-level diff.
