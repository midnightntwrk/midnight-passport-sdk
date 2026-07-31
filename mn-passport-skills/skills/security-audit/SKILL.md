---
name: security-audit
description: Key-management security review lens for Midnight Passport SDK changes — finds fixable secret mismanagement (blocking) and records residual risks in the private security register at ../mn-passport-sdk-debts. Run per tranche, or on demand for any change touching keys, witnesses, ceremonies, storage, or proving.
---

# security-audit — key-management review

Two outputs (`docs/development-workflow.md` §2): **blocking findings** (fix
now, before `pr-open`) and **residual-risk register entries** (insecure but
not resolvable now — recorded, never lost). Scope: the tranche's diff plus
any secret-lifecycle code it touches.

## Blocking checklist

- **Plaintext secret outside the kernel** — witness, device secret, envelope
  key, or PRF output passed to an adapter, dApp, agent, log line, error
  message, telemetry, or state projection (arch §4.1 invariant).
- **Witness not zeroised** after proof generation, or held beyond the proving
  window (§2.2, [C7]).
- **Missing or bypassed ceremony gate** before witness decryption or an
  authorised state transition (§2.2). The only legitimate exception is the
  agent path's policy-gated grant (§3.8).
- **Preimage sent to a remote prover unencrypted** — must be sealed to the
  prover's enclave public key before leaving the device (§2.5).
- **Silent privacy downgrade** — falling back from in-tab to remote proving
  without explicit user confirmation (§2.5).
- **Lock and key together** — envelope key and ciphertext held by the same
  custodian (e.g. vendor cloud holds both the passkey and the backup blob)
  without going through the accepted-risk decision (§3.6, arch §4.5).
- **Unencrypted private state at rest** — local entries must be
  `{version, nonce, ciphertext}`; never plaintext in IndexedDB, LevelDB,
  localStorage, or files (arch §4.5).
- **Secrets in transport metadata** — URLs, query params, headers not meant
  for them.
- **Over-scoped principals** — a dApp or agent receiving more than its
  scoped grant handle; an agent seeing the device/account key (§3.8, §3.9).
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
relevant code lands, if not already present: **enclave-key provenance**
(remote proving trusts the provided enclave key; no SDK attestation, §2.5)
and **vendor lock+key** (where the native vendor-keystore backup path is
used, §3.6 / arch §4.5).

## Output

Blocking findings with file references (fix before `pr-open`), plus the list
of register entries added or re-confirmed. Summarise register entries in the
PR description only at the level of "N residual-risk entries recorded
(private register)" — no risk details in this repo.
