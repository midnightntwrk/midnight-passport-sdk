# Findings — passkey PRF linking across origins (Related Origin Requests)

> **Status:** confirmed (automated runs) · 2026/08/17–2026/08/18
> **Hypothesis under test:** a partner dApp (`nightfi.test`) can create a
> passkey under RP ID `midnightpassport.test` via a WebAuthn Related Origin
> Request, evaluate the PRF extension, and derive a P-256 public key — and
> the Passport-alike app later authenticates with the same passkey and
> derives the **same** public key. Extended (2026/08/18) with the
> **attached-information leg**: the partner writes the deployed contract
> (ACC) address into the credential's **largeBlob**, and Passport reads it
> back from the passkey alone.

## Verdict

**Confirmed — both legs.** The full flow works end to end in Chromium:
`create()` under the foreign RP ID succeeded once the origin was listed in
`/.well-known/webauthn`, the PRF evaluated (at `create()` time, no extra
assertion needed), and both applications derived the **identical** P-256
public key from the PRF output. The 32-byte simulated deployed-contract
address written to the credential's largeBlob at `nightfi.test` was read
back **byte for byte** at `midnightpassport.test`. A negative control
proved the ROR check is load-bearing, not permissive.

## Environment

| | |
|---|---|
| Date | 2026/08/17 |
| Browser | Chromium 151.0.7922.34 (Playwright headless shell) |
| Authenticator | CDP virtual authenticator — CTAP 2.1, internal transport, resident keys, user verification, PRF, largeBlob |
| Topology | `nightfi.test` + `midnightpassport.test` → 127.0.0.1, single HTTPS host-routing server on port 443 (self-signed, `--ignore-certificate-errors`), run inside an unprivileged network namespace |
| RP ID | `midnightpassport.test` (both ceremonies) |
| PRF salt | `mn-passport/prf-experiment/v1` (identical in both apps) |
| Derivation | PRF output (32 bytes) → P-256 secret scalar → compressed public key (`@noble/curves` 2.3.0) |

## Automated run (e2e/run.mjs)

```json
{
  "date": "2026-08-18",
  "browser": "Chromium 151.0.7922.34 (Playwright)",
  "authenticator": "CDP virtual authenticator (ctap2_1, internal, hasPrf, hasLargeBlob)",
  "steps": {
    "nightfi.create-under-ror": "ok",
    "nightfi.prf-enabled": "true",
    "nightfi.derived-public-key": "020c46280d3d8629c014dd81eefcd345e32052d5b53acb2ac5b46f63563f1fad79",
    "nightfi.largeblob-supported": "true",
    "nightfi.deployed-contract-address": "ac3f29eb1c9bbbc85c4893855062f45015bce8735e85737b67f5f92705740d1b",
    "nightfi.blob-written": "true",
    "passport.get-discoverable": "ok",
    "passport.derived-public-key": "020c46280d3d8629c014dd81eefcd345e32052d5b53acb2ac5b46f63563f1fad79",
    "passport.attached-contract-address": "ac3f29eb1c9bbbc85c4893855062f45015bce8735e85737b67f5f92705740d1b",
    "public-keys-match": true,
    "contract-address-roundtrip": true
  }
}
```

**Ceremony discipline (adopted from the validated account-custody
prototype, and now enforced by both apps):** PRF is only *enabled* at
`create()` (bare `prf: {}`) and evaluated in its own `get()`, and every
`get()` carries **exactly one extension** — PRF eval, largeBlob write, and
largeBlob read are three separate ceremonies. An earlier iteration that
bundled `prf.eval` into `create()` and combined PRF with largeBlob in one
`get()` also passed on the virtual authenticator, but the combination is
not something real providers are expected to honour uniformly — the
prototype's "PRF results are only guaranteed during get()" note is treated
as load-bearing.

Step by step:

1. **`create()` under ROR — works.** From origin `https://nightfi.test` with
   `rp.id = "midnightpassport.test"`, the browser fetched
   `https://midnightpassport.test/.well-known/webauthn`, found the caller
   origin listed, and allowed registration. ROR covers **registration**, not
   just assertions.
2. **PRF under ROR — works.** `create()` reported `prf.enabled: true`, and
   the dedicated follow-up `get()` (still from `nightfi.test`, under ROR)
   returned the PRF output. This was the recorded unverified linchpin of
   the SDK evaluation — in Chromium it holds. (The virtual authenticator
   also returned PRF output during `create()` itself in an earlier
   iteration; per the ceremony-discipline note below, that behaviour is
   not relied upon.)
3. **Cross-origin key continuity — exact.** The discoverable-credential
   sign-in at `midnightpassport.test` (same RP ID, same salt) produced the
   same PRF output, hence the same derived P-256 public key,
   `02885074…d5a6`, byte for byte. PRF output is a function of the
   credential and the salt only — the calling origin does not enter it.
4. **Attached information round-trips through the passkey (largeBlob).**
   `create()` requested `largeBlob: { support: 'preferred' }` (reported
   `supported: true` under CTAP 2.1); nightfi simulated the ACC deploy as
   32 random bytes and wrote them in a dedicated `get()` carrying only
   `largeBlob: { write }` (spec requires an allowlist of exactly one
   credential for writes); Passport's discoverable sign-in read them back
   in a dedicated `largeBlob: { read: true }` ceremony — identical bytes,
   `ac3f29eb…0d1b`. Discovery of the user's deployed contract needed no
   registry, no backend — the passkey itself carried the pointer.

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

- **Real authenticators.** The virtual authenticator honours CTAP 2.1
  `hmac-secret` and `largeBlobs` by construction. Real-world support varies
  per passkey provider (Windows Hello, iCloud Keychain, Google Password
  Manager, third-party managers) — and **largeBlob's matrix is narrower
  than PRF's** (notably absent from Windows Hello at the time of writing),
  so the C9 browser × OS support matrix needs measuring on hardware for
  both extensions, separately. A first manual attempt on a stock Windows
  machine (2026/08/18) never reached a real provider: with the DevTools
  virtual environment off, ceremonies failed outright (`NotAllowedError`,
  no sheet — webauthn.io included), i.e. **passkeys wholly unavailable on
  that machine** (no Windows Hello enrolled). That user profile is real,
  and it is why the §2.2 password/KDF fallback and the managed path are
  not optional. The apps now log each ceremony's outcome on-page so any
  future real-provider run yields a complete support row. Both apps also
  mitigate providers that honour allowlisted assertions but do not
  enumerate discoverable credentials: nightfi remembers its credential ID
  (localStorage), and the Passport-alike offers an explicit-credential-ID
  diagnostic sign-in.
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
  create-then-assert. Attaching the deployed-contract address adds one
  more ceremony (largeBlob writes require an allowlisted `get()`), which
  fits naturally as the post-deploy confirmation gesture.
- **The passkey can carry its own bootstrap pointer.** With largeBlob, the
  credential itself delivered the deployed ACC address to Passport — a
  registry-less cold-start for the "discover your infrastructure" step.
  Where largeBlob is unsupported, this degrades to the registry/indexer
  lookup; it is a cache, never the source of truth (P8 stands). Anything
  sensitive stored there should be sealed under a PRF-derived key — the
  same credential then carries both the ciphertext and the means to open
  it, and the passkey provider sees only ciphertext.
- The well-known file is a live, per-ceremony security surface: every entry
  is an origin that can run ceremonies against Passport credentials, and
  removing an entry revokes that ability immediately (negative control).
  Governance of that list is an operational requirement, not a nicety.
