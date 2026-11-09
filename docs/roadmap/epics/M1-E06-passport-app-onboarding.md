# E06 · Passport app: onboarding

**Issue:** [#49](https://github.com/midnightntwrk/midnight-passport-sdk/issues/49)  
**Milestone:** 1 Foundation · **Track:** Passport app · **Steps:** 7–10 · **Stories:** 4  
**Packages:** none (Passport app or process work)  
**Sheet code:** 4P  
**Readiness:** ready, no story marked to discuss

## Goal

Ship the first Passport app screens: a new user creates a named account with face or fingerprint, and a returning user lands straight on it.

## Description

This is the first time a person sees Passport, so it has to feel simple and trustworthy: no seed phrase, no tokens to buy, no wallet jargon. All the heavy lifting is in E04; this epic is the experience on top of it, built with the brand and components from E02.

**Sign-up.** The user starts the flow and sees one passkey prompt, with a short explanation of what their face or fingerprint unlocks. Behind the screen, `owner` creates the passkey and derives the device key, or uses the p256 arm when the authenticator has no PRF.

**Deploy progress.** The account deploys in several waves. The screen shows progress as each wave lands, recovers from a failed wave without starting over, and ends on the sponsored starting balance.

**Name claim.** As soon as the account is live, the user picks a name such as maya.night. The app checks availability while the waves are still landing, then claims the name with the owner key. A user can skip this step and claim a name later.

**Returning users.** On a later visit, the app opens the user's existing account with one passkey tap and never shows the sign-up flow again.

The prover disclosure (rule 2) is shown through the consent hook that E04 provides, following the copy guidelines from E02.

## Scope

**In:** the sign-up flow, the deploy progress and balance screens, the name claim step, and the returning-user resume.

**Out:** the SDK logic (E04), and later account screens such as payments (E08) and devices (E15).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E06.01 | Onboarding flow: passkey creation | 7 | app |
| E06.02 | Deploy-wave progress and balance UI | 8 | app |
| E06.03 | Returning-user account resume | 8 | app |
| E06.04 | Name claim step after deploy | 10 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.02 UI component library and interaction patterns
- E04 Account deployment: E04.07 WebAuthn create with PRF → JubJub device key, E04.08 Sponsored deploy and starting balance, E04.11 Multi-wave ACC deploy planner, E04.12 Existing-account lookup by passkey, E04.15 Name registration call, E04.16 Name-to-ACC resolution

**Unlocks:** E19 Connect for dApps (1 story).

**Parallel with:** E03 Workspace, seams, and guardrails, E05 Contract binding.

## Exit criteria

- A new user on devnet goes from the first screen to a named account with a starting balance, with one passkey prompt.
- A failed deploy wave recovers on screen without restarting the flow.
- A returning user reaches their account with one tap.
- Skipping the name claim works, and the account screen offers it later.

## Verification plan

- An end-to-end UI test of sign-up and return on devnet.
- A manual pass on at least one phone and one laptop authenticator.
