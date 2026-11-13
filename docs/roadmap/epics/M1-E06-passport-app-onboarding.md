# E06 · Passport app: onboarding

**Issue:** [#49](https://github.com/midnightntwrk/midnight-passport-sdk/issues/49)  
**Milestone:** 1 Foundation · **Track:** Passport app · **Steps:** 9–10 · **Stories:** 3  
**Packages:** none (Passport app or process work)  
**Sheet code:** 4P  
**Readiness:** ready, no story marked to discuss

## Goal

Ship the first Passport app screens: a new user creates an account with face or fingerprint, and a returning user lands straight on it.

## Description

This is the first time a person sees Passport, so it has to feel simple and trustworthy: no seed phrase, no tokens to buy, no wallet jargon. All the heavy lifting is in E04; this epic is the experience on top of it, built with the brand and components from E02.

**Sign-up.** The user starts the flow and sees a short explanation of what their face or fingerprint unlocks. Behind the screen, `owner` creates the passkey, which becomes the account's first owner key on the p256 arm. The passkey signs every owner call, so creating it is one prompt and activating the account is another: the flow states its prompt count instead of promising one. A device the SDK does not support gets a clear message, from the authenticator support matrix in E04.

**Deploy progress.** The account deploys in several waves. The screen shows progress as each wave lands, recovers from a failed wave without starting over, and ends on the sponsored starting balance.

**Returning users.** On a later visit on the same device, the app opens the user's existing account and never shows the sign-up flow again.

The prover disclosure (rule 2) is shown through the consent hook that E04 provides, following the copy guidelines from E02.

## Scope

**In:** the sign-up flow, the deploy progress and balance screens, and the returning-user resume.

**Out:** the SDK logic (E04), the name claim, which is now E08.01 (name claim screen), and later account screens such as payments (E08) and devices (E20). Until the app repository exists, the E04 example page is what beta users open.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E06.01 | Onboarding flow: passkey creation | 9 | app |
| E06.02 | Deploy progress and balance UI | 10 | app |
| E06.03 | Returning-user account resume | 10 | app |

## Dependencies

**Blocked by:**
- E02 Passport app: brand and identity: E02.02 UI component library and interaction patterns
- E04 Account deployment: E04.10 Prover disclosure text and consent hook (rule 2), E04.11 Passkey on the p256 arm as the first owner key, E04.12 Account deploy in waves: plan, send, resume, activate, E04.13 Existing-account lookup, E04.14 WebAuthn authenticator support matrix and fallbacks

**Unlocks:** E08 Passport app: the account (2 stories), E13 Connect for dApps (1 story).

**Parallel with:** E03 Workspace, seams, and guardrails, E05 Contract binding.

## Exit criteria

- A new user on devnet goes from the first screen to a live account with a starting balance, with the stated number of passkey prompts.
- A failed deploy wave recovers on screen without restarting the flow.
- A returning user on the same device reaches their account without the sign-up flow.
- An unsupported device gets a clear message instead of a failed sign-up.

## Verification plan

- An end-to-end UI test of sign-up and return on devnet.
- A manual pass on at least one phone and one laptop authenticator.
