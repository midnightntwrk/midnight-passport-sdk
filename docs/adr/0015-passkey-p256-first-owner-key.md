# 0015 — The passkey signs on the p256 arm

Date: 2026/11/24 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#94 · ADR 0014 · requirements, "Keys"

## Context

- The ACC verifies a WebAuthn ES256 assertion in circuit, on the p256 arm
  (passport `contract/WEBAUTHN.md`; passport PRs #170, #175, #176, and
  #180). Thus a passkey can be an owner key with its private key in the
  authenticator.
- The PRF design gave a JubJub device key to the kernel of `owner` for each
  operation.
  That design is dropped.
- The circuit rebuilds the exact `clientDataJSON` from the challenge and the
  origin of the policy. It accepts two shapes: the plain one and the one with
  Chrome's GREASE member. The origin has the length that the build was
  compiled for.

## Decision

1. The first owner key of an account is a discoverable ES256 passkey on the
   p256 arm. Signing needs no PRF and takes no secret out of the
   authenticator. ADR 0014 reads the PRF of the same passkey for other keys.
2. `owner` creates the passkey with a random `user.id`, so a new passkey
   never replaces another one of the same user.
3. Before any prompt, `owner` refuses an origin that the build cannot
   rebuild. After the create prompt, it refuses a credential whose client
   data has another origin or `crossOrigin: true`. Thus a cross-origin
   iframe fails at create, not at the first owner call.
4. `owner` checks each assertion against the compiled profile, with the
   enrolled key, before any proof request. It does not ask again: every
   known refusal gives the same result on the next tap.
5. The create always asks for PRF, because some security keys turn it on
   only at create. It reads the PRF inputs that the caller gives (ADR 0014).
   A refused create zeros the PRF outputs.

## Consequences

- Prompts on the pinned build: create 1, activation 0 (the activation
  circuit takes no assertion), one owner call 1. Where the authenticator
  gives no PRF result at create, the PRF read of ADR 0014 is one more prompt.
- The SDK must know the page origin. The caller passes `location.origin`.
- On Chromium with a virtual authenticator, about 1 assertion in 5 carries
  the GREASE member. The circuit accepts it, so no re-prompt is needed.
  Safari, Firefox, and hardware authenticators are not tested yet.
- A partner origin (ADR 0005) cannot make a passkey that signs for an
  account made on the Passport origin, because the policy binds one origin.
