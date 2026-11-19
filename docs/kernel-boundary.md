# The owner kernel boundary

> **Status:** draft · 2026/11/17
> **Owns:** what the kernel holds, what enters it, and what leaves it.
> **Source of truth:** [`architecture.md`](./architecture.md), "The owner kernel
> invariant" and "What leaves the kernel". This doc derives from it. A conflict
> is a [`doc-sync`](./development-workflow.md) event, not a reason to bend the
> code.

The kernel in `owner` is the only code that holds an account secret in
plaintext. Every other package, and every other module in `owner`, gets a
signature, a public key, ciphertext, or an opaque handle. The kernel has one
public entry. No module outside the kernel imports its internals.

A kernel is a `Kernel` object, one per account, not a module-global. A process
can hold several accounts without their secrets colliding. `dispose` zeros
every secret the kernel still holds. It is the one teardown point, for example
on lock or logout.

## The secrets the kernel may hold

The list is open. E04.20 (account secrets) decides the final list and where each
secret comes from. The PRF device key was dropped: the passkey is the first
owner key on the p256 arm, and it signs inside the authenticator, so the kernel
holds no device key and no passkey-derived secret.

| Secret | Who may ask for an operation with it | How long it lives in memory |
|---|---|---|
| The encryption (viewing) secret key | The Passport app, for an owner operation. It leaves whole only to a holder of a read grant, after a separate consent (the read-access lifecycle, E17). | While the kernel uses it. Held through a handle until `releaseSecret`, or at most until `dispose`. |
| The recovery secret | The Passport app, during a recovery session or a recovery. | Only during the session or the recovery. Never at rest. |
| The guardian secret | When this user acts as a guardian, for one share response. | Only for that share. Never cached. (Open: the architecture lists it; the issue is silent. E04.20 decides.) |
| The WPP account key, and the package keys derived from it | The Passport app, before the handoff. | Not held in this SDK yet. It arrives with E17. (Open.) |
| The maintenance authority key | Open, if the SDK ends up holding it. | Open. E04.20 decides. |

An account is born with one signing arm and gains others later, so the live
signing-arm key stays in play. Who holds it is open (E04.20).

JavaScript cannot promise that memory is erased: a string or an engine copy can
remain. The guarantees below are what the SDK can test.

## What enters the kernel

- Raw secret bytes, for one operation. The caller passes a buffer. The kernel
  copies what it must keep, then zeros the caller's buffer.

## What leaves the kernel

No secret leaves the kernel. Only these items, derived from the secrets, leave
it (`architecture.md`, "What leaves the kernel"):

- A signature over an ACC challenge, inside a transaction.
- An unproven transaction, to the V1 prover (the prover sees the private
  inputs; the user is told).
- A key for one WPP package, to one dApp, at the handoff, after a passkey tap
  and a separate consent.
- Ciphertext, to WPP storage.
- A guardian share, sealed to the requesting owner, after a passkey tap and a
  confirmation of the account.
- Two signatures, one under the recovery secret and one under the successor
  device key, inside a recovery submit. The prover learns no scalar.
- The ACC address, and the viewing key and the WPP account key only as
  ciphertext, in the metadata of an isolated backup owner key.

The viewing key is the one exception: it leaves the kernel whole, to a holder of
a read grant, after a separate consent. That export belongs to the read-access
lifecycle (E17).

## Secret hygiene

- A kernel function that takes a secret buffer zeros it with `fill(0)` before it
  returns, and on a throw.
- A kernel error carries no key bytes, and a secret never reaches a log or an error.
- The kernel keeps the only reference to a retained secret, in a private field,
  keyed by its handle. A handle exposes no byte accessor. The kernel zeros the
  retained copy when it releases the handle, and `dispose` zeros every copy the
  kernel still holds.

`releaseSecret` with an unknown handle throws `UnknownHandleError`, a `core`
`PassportError` (E03.03). It carries no secret, so no serialization reveals one.
