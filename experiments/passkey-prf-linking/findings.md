# Findings — passkey PRF linking across origins (Related Origin Requests)

> **Status:** confirmed (automated run) · 2026/08/17
> **Hypothesis under test:** a partner dApp (`nightfi.test`) can create a
> passkey under RP ID `midnightpassport.test` via a WebAuthn Related Origin
> Request, evaluate the PRF extension, and derive a P-256 public key — and
> the Passport-alike app later authenticates with the same passkey and
> derives the **same** public key.

## Verdict

**Confirmed.** The full flow works end to end in Chromium: `create()` under
the foreign RP ID succeeded once the origin was listed in
`/.well-known/webauthn`, the PRF evaluated (at `create()` time, no extra
assertion needed), and both applications derived the **identical** P-256
public key from the PRF output. A negative control proved the ROR check is
load-bearing, not permissive.

## Environment

| | |
|---|---|
| Date | 2026/08/17 |
| Browser | Chromium 151.0.7922.34 (Playwright headless shell) |
| Authenticator | CDP virtual authenticator — CTAP2, internal transport, resident keys, user verification, PRF |
| Topology | `nightfi.test` + `midnightpassport.test` → 127.0.0.1, single HTTPS host-routing server on port 443 (self-signed, `--ignore-certificate-errors`), run inside an unprivileged network namespace |
| RP ID | `midnightpassport.test` (both ceremonies) |
| PRF salt | `mn-passport/prf-experiment/v1` (identical in both apps) |
| Derivation | PRF output (32 bytes) → P-256 secret scalar → compressed public key (`@noble/curves` 2.3.0) |

## Automated run (e2e/run.mjs)

```json
{
  "date": "2026-08-17",
  "browser": "Chromium 151.0.7922.34 (Playwright)",
  "authenticator": "CDP virtual authenticator (ctap2, internal, hasPrf)",
  "steps": {
    "nightfi.create-under-ror": "ok",
    "nightfi.prf-enabled": "true",
    "nightfi.prf-evaluated-at-create": "true",
    "nightfi.derived-public-key": "033caed65977d876bac46ea5892f9fb6212375a96cd433258cb45e6d0abd1faacc",
    "passport.get-discoverable": "ok",
    "passport.derived-public-key": "033caed65977d876bac46ea5892f9fb6212375a96cd433258cb45e6d0abd1faacc",
    "public-keys-match": true
  }
}
```

Step by step:

1. **`create()` under ROR — works.** From origin `https://nightfi.test` with
   `rp.id = "midnightpassport.test"`, the browser fetched
   `https://midnightpassport.test/.well-known/webauthn`, found the caller
   origin listed, and allowed registration. ROR covers **registration**, not
   just assertions.
2. **PRF under ROR — works, including at `create()`.** The PRF extension
   reported `enabled: true` and returned its output during the create
   ceremony itself (`prf-evaluated-at-create: true`), so no follow-up
   assertion was needed. This was the recorded unverified linchpin of the
   SDK evaluation — in Chromium it holds.
3. **Cross-origin key continuity — exact.** The discoverable-credential
   sign-in at `midnightpassport.test` (same RP ID, same salt) produced the
   same PRF output, hence the same derived P-256 public key,
   `033caed6…1faacc`, byte for byte. PRF output is a function of the
   credential and the salt only — the calling origin does not enter it.

## Negative control — ROR is enforced

With `origins: []` in the well-known file, the identical `create()` call at
`nightfi.test` failed with:

> `SecurityError: The relying party ID is not a registrable domain suffix
> of, nor equal to the current domain. Subsequently, fetching the
> .well-known/webauthn resource of the claimed RP ID was successful, but no
> listed origin matched the caller.`

So the success in the main run was granted **by** the related-origin
authorisation — the well-known fetch happens on every ceremony, and an
unlisted origin is rejected outright. (Also confirms the fetch targets the
RP ID on port 443: nothing else was listening.)

## Not yet verified (bounded by this setup)

- **Real authenticators.** The virtual authenticator honours CTAP2
  `hmac-secret` by construction. Real-world PRF support varies: platform
  passkey providers (Windows Hello, iCloud Keychain, Google Password
  Manager, third-party managers) each decide independently — the C9
  browser × OS support matrix still needs measuring on hardware.
- **Safari 18+ / iOS.** ROR shipped there per current documentation, but
  PRF-under-ROR on Apple platforms is untested here (headless WebKit does
  not expose a virtual authenticator with PRF).
- **Firefox** has not shipped ROR at all — a redirect-to-Passport fallback
  remains mandatory in any real design.
- **The ~5-label origins cap** was not exercised (one partner origin);
  the ecosystem-size constraint stands as documented in the SDK evaluation.
- **RP-side verification topology** (challenge issuance, origin allow-list
  checking) is out of scope here — the apps verify nothing server-side.

## Implications for the SDK evaluation

- The core mechanism behind "partner-origin onboarding, Passport-anchored
  identity" is real: a passkey created inside a partner dApp is *the same
  credential, with the same PRF-derived key material*, when the user later
  opens Passport. The decentralised path's device key (requirements §2.3,
  PRF → Jubjub) would survive partner-origin onboarding unchanged — this
  experiment derives P-256 only to match the proposal's framing.
- `prf-evaluated-at-create: true` means partner onboarding can be a
  **single ceremony** (create + key derivation in one user gesture), not
  create-then-assert.
- The well-known file is a live, per-ceremony security surface: every entry
  is an origin that can run ceremonies against Passport credentials, and
  removing an entry revokes that ability immediately (negative control).
  Governance of that list is an operational requirement, not a nicety.
