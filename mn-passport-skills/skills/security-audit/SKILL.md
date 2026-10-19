---
name: security-audit
description: Key-management security review lens for Midnight Passport SDK changes — finds fixable secret mismanagement (blocking) and records residual risks in the private security register at ../mn-passport-sdk-debts. Run per tranche, or on demand for any change touching keys, witnesses, ceremonies, storage, or proving.
---

# security-audit — key-management review

Two outputs (`docs/development-workflow.md`, "Review lenses"): **blocking
findings** (fix now, before `pr-open`) and **residual-risk register entries**
(insecure but not resolvable now — recorded, never lost). Scope: the
tranche's diff plus any secret-lifecycle code it touches. Citations: "rule N"
is the "Normative rules" table of `docs/sdk-requirements.md`; "architecture"
and "provider-integration" name a section of those docs.

## Blocking checklist

- **Plaintext secret outside the kernel** — the PRF output, the JubJub device
  key, a WPP account or package key, or the viewing key passed to an adapter,
  dApp, agent, log line, error message, telemetry, or state projection, other
  than as "What leaves the kernel" allows (architecture, "The core kernel
  invariant").
- **Secret held beyond its operation** — the kernel derives the device key and
  the WPP account key for one operation only, then wipes them (requirements,
  "Ceremonies").
- **Missing or bypassed ceremony gate** — no passkey tap at grant issuance or
  at the private-data handoff, or a device signature in the Passport app
  without a tap (rule 1). A missing tap for each call is **not** a finding.
- **Missing prover disclosure** — remote proving without telling the user that
  the prover sees the private inputs of each proof, for the ACC and for each
  dApp circuit (rule 2). Once a trusted-hardware prover exists, a proving
  input sent without encryption to its enclave is blocking.
- **Owner key outside the Passport app** — a dApp or an agent that onboards a
  user, holds or drives a device key, or reaches the WaaS backup key (rule 11).
- **WaaS backup key without its guards** — enrolled without isolation or
  protected writes; the viewing key or the WPP account key readable in the
  metadata; an entry that is not authenticated and bound to the ACC address
  and the key versions; no refresh or stale mark after a key rotation (rule
  12; provider-integration, "The WaaS provider").
- **Read-access lifecycle skipped** — a read grant without rotate-before-share,
  a rotation without a re-seal or a mark for reconnection, or a revocation
  without a rotation (rule 13).
- **Lock and key together** — one custodian that holds a ciphertext and its
  key, outside the disclosed WaaS case.
- **Unencrypted private state at rest** — WPP storage and local caches hold
  ciphertext only; never plaintext in IndexedDB, LevelDB, localStorage, or
  files.
- **Secrets in transport metadata** — URLs, query params, headers not meant
  for them.
- **Over-scoped principals** — a dApp or an agent with more than its own grant
  key and scope, or more than one grantee key for one account and origin
  (rules 9 and 10).
- **Weak randomness** — key or nonce material from anything but a CSPRNG.
- **Register or secret files staged in this repo** — `.mn-passport-skills/` and any
  security findings must never be committed here (gitignore is the backstop;
  check anyway).

## Residual-risk register (private)

Lives in the **private sibling repo `../mn-passport-sdk-debts`**
(`security-register.md`). Findings that are real but not fixable now go
there — never into this repo.

Procedure:

1. Confirm the repo is present and pushable
   (`git -C ../mn-passport-sdk-debts ls-remote origin`). If not, run
   `mn-passport-skills:devenv` and stop until it is.
2. **Append** an entry (never rewrite history; the register accumulates):

   ```markdown
   ## 2026/07/27 — <branch / PR title> (Refs midnightntwrk/passport#NN)

   ### <risk title>
   - **Risk:** what can go wrong, for whom.
   - **Why it can't be fixed yet:** the constraint (upstream, protocol, scope).
   - **Mitigations:** what reduces it today, and the trigger to revisit.
   ```

3. Commit and push in the debts repo. This push is the workflow's one
   **recorded exception** to the no-outward-actions rule — it is allowed
   without stopping.
4. When later work resolves an entry, mark it **Resolved (date, PR)** in
   place — do not delete it.

Known accepted risks from the design docs — record them the moment the
relevant code lands, if not already present: **the V1 prover sees the private
inputs** (rule 2, until a trusted-hardware prover exists), **WaaS provider
trust** (an independently usable owner key; the viewing key is readable to
the provider if it keeps it in a Passport-only part — provider-integration,
"Custody disclosure"), and **a revoked read-grant holder keeps what it already
read** (rule 13).

## Output

Blocking findings with file references (fix before `pr-open`), plus the list
of register entries added or re-confirmed. Summarise register entries in the
PR description only at the level of "N residual-risk entries recorded
(private register)" — no risk details in this repo.
