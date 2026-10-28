# 0006 — Guardian recovery: secrets in the kernel, client-side controls in core

Date: 2026/10/26 · Status: proposed
Refs: MIP-0022 (account recovery) · C14 (total-loss recovery flow) · C15
(helper protocol) — planning workspace

## Context

The requirements (section "Recovery") ask the SDK to recover a lost account
through guardians and paper keys, and the architecture listed a Recovery seam
with `adapter-recovery`. It did not say how the protocol maps onto the kernel
and the adapters.

MIP-0022 now specifies the protocol (Proposed, upstream #339, amended by
#385), and the reference ACC has the circuits: `publish_recovery_session`,
`recover_submit`, `recover_cancel`, and `recover_finalise`. Recovery runs in
two phases with a veto window, and the gate verifies signatures, so the
recovery secret `s` never enters a proof.

Two facts force decisions in the SDK:

- **Placement.** Sampling `s`, deriving a guardian secret, and
  reconstructing `s` from shares all handle secrets. An adapter must not.
- **The client is trusted.** MIP-0022 protects `s` from parties outside the
  client, and it leaves freshness and transport authentication to the
  wallet. Beyond what a compromised SDK can already do with device keys,
  recovery adds a backdoor that outlives the compromise (a known `s`
  published at a session), guardians that share one code base (a profile A
  guardian secret is a PRF output that is the same for every session, so one
  malicious build can harvest it during any tap), and share-request phishing
  at scale. In total loss the veto window is only a delay and an alarm.

## Decision

1. **Secrets in the kernel.** `s`, the guardian secret, reconstruction, the
   local check against `P`, the wrap of the viewing key, and the signatures
   under `s` and the successor key live in the `core` kernel. They join the
   list of the kernel invariant.
2. **Flows in `core`.** The session, guard, recover, cancel, finalize, and
   liveness flows live in `core`. `core` runs only in the Passport app and
   dApps and agents never link it, so no partner bundle carries recovery
   code. No separate package is needed.
3. **Transport in `adapter-recovery`.** It carries sealed, authenticated
   MIP-0022 §7 messages only.
4. **Messages and tags in `mn-passport-protocol`.** The §7 messages, the four
   recovery tags, and the guardian PRF salt.
5. **The kernel enforces the client obligations** of MIP-0022: a fresh `s`
   and session id for each session, a full roster for each session, `s`
   never at rest, a local check before submit, rejection of an unknown
   artifact-set version, and viewing-key rotation for a for-cause session.
   Each rotation of the viewing key, for any cause, starts a new full-roster
   session, because MIP-0022 has no rewrap. Until it completes, `core`
   marks the recovery backup as stale and warns the user.
6. **Roster diversity by default.** `core` refuses a roster in which
   profile A guardians alone can reach the threshold. Each quorum needs a
   cold-signer or paper share. An override needs a passkey tap and is
   recorded. This limits the widespread harvesting of passkey guardian
   secrets. Cold-signer and paper shares still pass through software, so it
   does not stop a compromised client.
7. **The roster record names the SDK version** that ran the session. A
   signed list of revoked versions in each release forces a new session.
8. **A deliberate guard flow and alarms.** A tap per share response, the
   guardian secret derived only in this flow and never cached, and watchers
   for pending recoveries on the user's own account and on the accounts the
   user guards.

The full design is [`architecture.md`](../architecture.md), section
"Recovery".

## Consequences

- The client stays trusted. The controls reduce some risks and make some
  attacks easier to see. They do not keep a compromised build from reaching
  a quorum, and they do not detect a backdoored session.
- Each read grant and each revocation rotates the viewing key, so each one
  costs a full-roster session. If a guardian cannot answer, the recovery
  backup stays stale.
- A user with no cold signer and no paper key meets friction at set-up (the
  override), by design.
- The roster record must survive total loss, so it cannot live only in WPP.
  Where it lives is open.
- A p256 passkey cannot be the successor device until a p256 gate exists.
- `buss-wasm` and Pleiades must reach a published, pinned, audited build,
  under the 7-day cooldown, before the default implementation ships.
- The architecture depends on upstream work that is still open: the proof
  and node validation of the device-set reset (#183) and the CRYPTO-MEMO
  answers.
