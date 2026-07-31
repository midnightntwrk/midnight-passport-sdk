---
name: verify
description: "Does it actually run?" — end-to-end verification lens for Midnight Passport SDK tranches. Drives the affected flow for real (build, devnet, compile, /verify) instead of trusting that review passed, and records open validations in the gitignored verify register. Run per tranche before pr-open, or on demand.
---

# verify — does it actually run?

A change that passes conformance, security, and style **but does not prove
or submit is not done** (`docs/development-workflow.md` §2). This lens
closes the first feedback loop: run the affected flow, don't infer it.

## Procedure

1. **Identify the affected flow(s)** from the tranche: onboard, deposit,
   grant issue/revoke, device add/remove, recover, prove, connect, sync.
2. **Static floor** — build, typecheck, and unit tests (`npm run` scripts
   once they exist). Failing here means the tranche is not ready for the
   deeper checks.
3. **Run it for real**, leaning on the repo's installed tooling rather than
   reinventing it:
   - `midnight-verify` plugin (`/midnight-verify:verify` or `fast-verify`)
     for claims about Compact, SDK APIs, or runtime behaviour.
   - `midnight-cq:quality-check` for the test suites.
   - `midnight-tooling:devnet` / proof-server skills for infrastructure;
     `mn-passport-skills:devenv` first if anything is down.
   - Compile any touched `.compact` via the Compact CLI (upgrade first —
     `compact check`).
4. **Judge against the tranche's acceptance gate** from the spec-driver
   plan — the gate is the pass/fail criterion, not "it seems to work".

## The verify register (gitignored, local)

Open validations this lens cannot close now live in
`.mn-passport-skills/verify-register.md` — persistent and appended, owned jointly
with `mn-passport-skills:doc-sync` (which sweeps it for re-checks). Entry format:

```markdown
## [PROVISIONAL] <what remains unverified> — 2026/07/27
- **Claim / assumption:** what the code currently relies on.
- **Why open:** needs a real account / upstream not launched / device-specific.
- **Close by:** the concrete re-check that would settle it.
- Refs midnightntwrk/passport#NN
```

Seed entries the design docs already flag as open, as soon as the related
code lands:

- Whether the managed (provider-held) wallet can itself **balance and
  submit an arbitrary ACC contract transaction** — unproven; the demo used
  the genesis wallet (§2.6, [C24]).
- iOS `navigator.storage.persist()` grant behaviour and installed-PWA
  storage durability (arch §8.5).

## Output

Per flow: what was executed, against what environment (devnet, proof
server), and the result. Blocking if the acceptance gate fails or the flow
cannot complete. List register entries added; entries closed get marked
resolved in place.
