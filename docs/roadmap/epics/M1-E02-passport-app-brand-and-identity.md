# E02 · Passport app: brand and identity

**Issue:** [#45](https://github.com/midnightntwrk/midnight-passport-sdk/issues/45)  
**Milestone:** 1 Foundation · **Track:** Passport app · **Steps:** 1–2 · **Stories:** 3  
**Packages:** none (Passport app or process work)  
**Sheet code:** 2P  
**Readiness:** ready, no story marked to discuss

## Goal

The Passport app gets its own visual identity and voice before its screens are built, so it reads as a personal identity product rather than a crypto wallet.

## Description

Every Passport app epic after this one builds screens, and all of them need the same foundations: colors, type, icons, components, and a voice. Building those first avoids redesigning every screen later, and lets the app work start on day one, in parallel with the SDK.

**Brand tokens.** The logo, the color palette for light and dark themes, the type scale, and the iconography, delivered as design tokens the app imports. The product is Midnight-branded, not IOG-branded.

**Component library and interaction patterns.** The reusable components and the main UX decisions every screen follows: navigation, error states, loading and progress, and above all the passkey moments. A passkey tap happens when the account is created, when a grant is issued, and when the private-data handoff completes (rule 1); those moments need one consistent pattern that tells the user what they are approving.

**Voice and copy.** How the app talks to people who have never used a wallet: plain language for consents (the prover disclosure, grant scopes, private-data access), no jargon such as "seed phrase" or "gas", and clear errors that say what to do next.

## Scope

**In:** the brand tokens, the component library, the interaction patterns for passkey and consent moments, and the copy guidelines.

**Out:** the screens themselves, which belong to the later app epics.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E02.01 | Brand tokens: color, type, iconography | 1 | app |
| E02.02 | UI component library and interaction patterns | 2 | app |
| E02.03 | Voice and copy guidelines | 2 | app |

## Dependencies

**Blocked by:** nothing outside this epic.

**Unlocks:** E06 Passport app: onboarding (1 story), E12 Passport app: grants (1 story), E20 Passport app: backup and devices (1 story).

**Parallel with:** E03 Workspace, seams, and guardrails, E04 Account deployment, E05 Contract binding.

## Exit criteria

- The tokens ship as a package the app imports, in light and dark themes.
- The component library covers the onboarding screens of the next app epic.
- The copy guidelines include worked examples for the prover disclosure and a grant scope.

## Verification plan

- A design review of the tokens and components in both themes.
- An accessibility check on contrast and focus states.
