# M4 — Hardening & demo (feature specs)

> Close the review lenses, land the privacy disclosure, and ship the beta demo.
> Backing: [`development-workflow.md`](../../development-workflow.md) (lenses,
> registers), [`sdk-requirements.md`](../../sdk-requirements.md) §2.5,
> [`beta-scope.md`](../../beta-scope.md) §6. Depends on M1–M3; staging integration
> gates on Dynamic + BCW.

## FS-4.1 — Reduced-privacy disclosure + standing reminder

- **Objective.** Make the remote-proving privacy posture explicit to the user.
- **In scope.** An onboarding disclosure that proving is remote (the witness is
  sealed to BCW's enclave) and a **standing reminder** surface. Beta has no
  in-tab → remote switch, so this is disclosure, not a consent-gated switch.
- **Backing.** requirements §2.5 (privacy posture, standing reminder);
  provider-integration §5.1 (the enclave sees the sealed preimage).
- **Surface.** A disclosure step in the onboarding flow + a persistent indicator.
- **Dependencies.** FS-1.2. **Gate:** none.
- **Acceptance.** Onboarding shows the disclosure; the reminder persists across
  sessions.
- **Verify.** e2e that the disclosure and the standing reminder appear.
- **Tranches.** (1) onboarding disclosure; (2) standing reminder indicator.
- **Open questions.** Exact wording (owned by `mn-passport-skills-code-style` / Midnight
  brand); reminder placement.
- **Issue.** `#TBD`

## FS-4.2 — Beta hardening pass + demo

- **Objective.** Run the full lens pass, close the registers, and ship the demo.
- **In scope.** `security-audit` (fix blocking findings; update the residual-risk
  register), `conformance` (all normative MUSTs), `verify` (the flow actually
  proves and submits), `doc-sync` (docs current + ADRs for any divergence); a
  **demo runbook** exercising onboarding + connect + the reference dApp.
- **Out of scope.** New features; anything from the deferred list.
- **Backing.** development-workflow.md (lenses + registers + STATE.md);
  beta-scope §6 (delivery).
- **Surface.** Not code as such — a hardening pass plus a demo runbook; register
  and `STATE.md` updates.
- **Dependencies.** FS-1.2, FS-2.2, FS-3.1. **Gate:** Dynamic + BCW (staging).
- **Acceptance.** The lenses pass; blocking findings fixed; the residual-risk and
  verify registers are current; the demo runs end-to-end in staging.
- **Verify.** The full `mn-passport-skills-verify` suite against the integrated system
  (real Dynamic + BCW in staging).
- **Tranches.** (1) lens pass + register close-out; (2) demo runbook + dry run.
- **Open questions.** Demo environment — staging with real Dynamic + BCW, or a
  mixed mock/real setup if a gate slips.
- **Issue.** `#TBD`
