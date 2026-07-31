# M3 — Reference dApp (feature specs)

> A reference **marketing experience, fully off-chain**, that installs
> `mn-passport-connect`, signs the user in, and personalises. It never spends,
> never asks for a grant, and never touches witness state — which is exactly why
> it is a safe first integration.
> Backing: [`beta-scope.md`](../../beta-scope.md) §2 (reference dApp) & §3.
> Depends on M2; buildable against a mock connector until then.

## FS-3.1 — Marketing experience (off-chain)

- **Objective.** Dogfood the connector end-to-end with a real, off-chain dApp.
- **In scope.** A small web app that installs `mn-passport-connect`, runs
  Sign-In-with-Passport, reads `{ name, account }`, and personalises the
  experience per Passport account. Entirely off-chain.
- **Out of scope.** Any on-chain effect — spending, grants, witness state,
  deposits.
- **Backing.** beta-scope §2 (the reference dApp), §3 (active slice).
- **Surface.** A web app depending only on `mn-passport-connect` (+ its protocol
  types). No `core`, no `contract`.
- **Dependencies.** FS-2.2. **Gate:** none (mock connector until M2 lands).
- **Acceptance.** The dApp completes the sign-in flow for a real user and
  personalises from the profile.
- **Verify.** Playwright e2e over the sign-in flow; `mn-passport-skills-conformance`
  confirms it is read-only and off-chain (no spend, no grant, no witness).
- **Tranches.** (1) scaffold + mock connector; (2) wire the real `connect`;
  (3) the personalisation / demo surface.
- **Open questions.** What the "marketing experience" does concretely (the
  raffle-style personalisation is a product decision, TBD); hosting origin (note
  the cross-origin storage isolation between the dApp origin and the Passport PWA).
- **Issue.** `#TBD`
