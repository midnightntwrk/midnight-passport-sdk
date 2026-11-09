# E18 · Passport app: recovery

**Issue:** [#61](https://github.com/midnightntwrk/midnight-passport-sdk/issues/61)  
**Milestone:** 5 Account recovery · **Track:** Passport app · **Steps:** 11–11 · **Stories:** 1  
**Packages:** none (Passport app or process work)  
**Sheet code:** 9P  
**Readiness:** ready, no story marked to discuss

## Goal

Give users the screens to choose guardians, act as a guardian for someone else, and recover their own account.

## Description

Recovery is rare but critical, and it has two very different users: the person who lost their devices, and the guardian helping them. Both need clear, calm screens.

**Setting up guardians.** Choose guardians and a threshold, with the diversity warnings from E16 explained in plain language.

**Acting as a guardian.** A guardian receives a request, confirms the account, taps, and returns their share.

**Recovering.** Start a recovery on a new device, follow the guardians' answers, see the waiting period, and finish. Any remaining device shows a clear alarm with a cancel button.

## Scope

**In:** the guardian setup screens, the guardian response screens, and the recovery screens, including the alarm and cancel.

**Out:** the SDK logic (E16).

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E18.01 | Guardian setup and recovery screens | 11 | app |

## Dependencies

**Blocked by:**
- E16 Guardian recovery: E16.05 Guardian enrollment and share sealing, E16.07 Secret reconstruction and recovery start

**Unlocks:** no other epic waits on it.

**Parallel with:** E17 Read-access lifecycle.

## Exit criteria

- A user sets up guardians from the app.
- A guardian answers a request from the app.
- A user recovers their account on a fresh device from the app, and a remaining device can cancel it.

## Verification plan

- An end-to-end UI test of a full recovery on devnet with test guardians.
