# E24 · Identity and credentials

**Issue:** [#66](https://github.com/midnightntwrk/midnight-passport-sdk/issues/66)  
**Milestone:** 8 Use Cases · **Track:** Use cases · **Steps:** 8–10 · **Stories:** 4  
**Packages:** `owner`, `adapter-did`, `contract`  
**Sheet code:** E12  
**Readiness:** ready, no story marked to discuss

## Goal

Give each Passport a decentralized identifier (DID) that stays stable when devices change, and later verifiable credentials.

## Description

A Passport is more than an account: it can be an identity. This epic adds a `did:midnight` identifier to each Passport, so other services can recognize and verify it, and builds toward credentials the user can hold and present.

**Creating and resolving.** The Passport app creates one `did:midnight` identifier per Passport, through `adapter-did`, a wrapper over `midnight-did-api`. Anyone can resolve it to its DID document.

**Control.** At first the Passport app holds the DID's controller key. Later the ACC becomes the DID's controller, so device changes and recovery keep control of the identity. Whether the controller key is derived from the PRF output or kept in WPP, and whether a separate JubJub DID key is acceptable until then, are open questions 4 and 5 in the requirements.

**Credentials.** The Passport app issues, holds, and presents verifiable credentials with selective disclosure, sharing only what a verifier needs.

## Scope

**In:** DID creation, DID resolution, the ACC as DID controller, and verifiable credentials.

**Out:** sign-in (E13), which uses the account and name, not the DID.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E24.01 | did:midnight creation | 8 | owner, adapter-did |
| E24.02 | DID document resolution | 9 | owner, adapter-did |
| E24.03 | ACC as DID controller | 9 | contract, adapter-did |
| E24.04 | Verifiable credentials, selective disclosure | 10 | owner |

## Dependencies

**Blocked by:**
- E04 Account deployment: E04.12 Account deploy in waves: plan, send, resume, activate
- E19 Devices and multi-device sync: E19.02 Owner key add and remove on the ACC

**Unlocks:** no other epic waits on it.

**Parallel with:** E25 Cross-chain assets.

## Exit criteria

- A Passport has a resolvable `did:midnight` identifier.
- After a device change, the DID still resolves and is controlled by the same user.
- A credential is issued, held, and presented with selective disclosure.

## Verification plan

- Devnet tests for create, resolve, and control after a device change.
