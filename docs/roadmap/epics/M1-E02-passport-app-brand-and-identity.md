# E02 · Passport app: brand and identity

**Issue:** [#45](https://github.com/midnightntwrk/midnight-passport-sdk/issues/45)  
**Milestone:** 1 Foundation · **Track:** Passport app · **Steps:** 1–1 · **Stories:** 1  
**Packages:** none (Passport app or process work)  
**Sheet code:** 2P  
**Readiness:** ready, no story marked to discuss

## Goal

Design the Passport app as a whole before its screens are built: the UX flows, the pages, and the shared design foundations, so it reads as a personal account rather than a crypto wallet.

## Description

Every Passport app epic after this one builds screens, and all of them follow the same flows and use the same foundations. Designing those first avoids reworking every screen later, and lets the app work start on day one, in parallel with the SDK.

**UX flows and pages.** The journeys a user goes through, end to end: onboarding, returning, the account home, sending, receiving, activity, and approving a dApp's grant. The page map says which pages these flows need and how the user moves between them, with a wireframe for each page of milestones 1 and 2. Later flows, such as devices, backup, and recovery, get their entry points now.

**Passkey and consent moments.** Each owner call is a passkey prompt, so creating the account, activating it, and approving a grant each need one consistent pattern that tells the user what they are approving (rule 1). The consents, such as the prover disclosure (rule 2) and a grant's scope, get one pattern too.

**Design foundations.** The color palette for light and dark themes, type, iconography, the core components, and the voice: plain language for people who have never used a wallet, with no jargon such as "seed phrase" or "gas". The product is Midnight-branded, not IOG-branded.

## Scope

**In:** the UX flows, the page map and wireframes, the passkey and consent patterns, the page states, and the design foundations.

**Out:** the screens themselves, which belong to the later app epics, and the app repository.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E02.01 | App design: UX flow, pages, and design foundations | 1 | app |

## Dependencies

**Blocked by:** nothing outside this epic.

**Unlocks:** E06 Passport app: onboarding (1 story), E08 Passport app: the account (5 stories), E12 Passport app: grants (1 story), E20 Passport app: backup and devices (1 story).

**Parallel with:** E03 Workspace, seams, and guardrails, E04 Account deployment, E05 Contract binding.

## Exit criteria

- The flows of milestones 1 and 2 are drawn end to end, with a wireframe for each page.
- One pattern exists for every passkey prompt and every consent, with worked copy for the prover disclosure and a grant scope.
- The foundations ship as tokens and components the app imports, in light and dark themes.

## Verification plan

- A design review of the flows, the page map, and the foundations, signed off by the product owners.
- An accessibility check on contrast and focus states.
