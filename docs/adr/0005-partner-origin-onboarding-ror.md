# 0005 — Partner-origin onboarding via Related Origin Requests; the `onboard` facade

Date: 2026/08/18 · Status: accepted
Refs: [midnightntwrk/passport#77](https://github.com/midnightntwrk/passport/issues/77)
(C27 · Passport Facade)

## Context

The `experiments/passkey-prf-linking/` experiment (findings 2026/08/17–18)
confirmed the mechanism behind "Passport as the common WebAuthn identity
layer": a partner dApp can create a passkey under the Passport RP ID via a
**Related Origin Request**, the **PRF output — and therefore the derived key
— is identical** when the same credential is later exercised at the Passport
origin, and a **largeBlob** written at the partner origin (the deployed ACC
address) reads back byte-for-byte at Passport. A negative control proved the
related-origins check is enforced per ceremony. The compatibility floor was
measured (ROR: Chrome/Edge 128 / Safari 18 / Firefox 152; PRF: iOS 18,
Android GPM by default, Windows 11 25H2; largeBlob: Apple only among the
platform providers), and the full flow was confirmed manually on a real
macOS authenticator.

The product wants this as an SDK capability: an external dApp onboards a new
Passport user (passkey → ACC deploy → largeBlob bootstrap) and signs an
existing user in. The first iteration is the **passkey/PRF path only**,
connected **directly** to the third-party proving and DUST sponsorship
service (no provider in the loop); the managed provider-authoriser variant
is deferred to a future iteration with a recorded TODO.

Three shapes were considered for the packaging:

1. a standalone thin package depending only on `protocol` + `contract`
   (the `connect` rule applied to onboarding) — rejected: issuance performs
   ceremony, secret-derivation, and deploy-pipeline work, so a core-free
   package would **duplicate the kernel's secret handling** — two
   implementations of the most security-sensitive code in the SDK;
2. folding onboarding into `mn-passport-connect` — rejected: it would drag
   the custody kernel into every conversational dApp bundle and break the
   §4.4 rule for the package where it matters most;
3. **a facade**: a new `mn-passport-onboard` package that *links* `core` and
   the adapters, contains composition only, and exposes a deliberately
   narrow API.

## Decision

- **Adopt partner-origin onboarding** as requirements **§3.13**, designed in
  [`partner-onboarding.md`](../partner-onboarding.md) and specced as
  **FS-2.3**.
- **Package it as the `mn-passport-onboard` facade over `core` + adapters**
  (option 3): one kernel implementation, no duplicated functionality;
  reduced partner-origin scope is expressed as **API narrowness**
  (`createPassport`, `signIn`, `capabilities` — issuance and recognition
  only), not as a parallel code path. The **`connect` rule is unchanged**;
  `onboard` is the recorded exception because issuance is custody work, and
  a dApp embedding it embeds the custody core knowingly — that is its threat
  model, stated in the design doc and carried into the security register.
- **Shared constants move to `mn-passport-protocol`**: the Passport RP ID
  (config-overridable — the domain may change), the PRF device-key salt
  (fixing FS-0.8's provisional convention), and the versioned largeBlob
  payload schema with its pure codec.
- **The largeBlob is a cache, never the source of truth**; the redirect-to-
  Passport fallback is mandatory below the compatibility floor; the
  related-origins list is a governed, curated surface (~5-label cap).
- **Beta scope is amended** to include partner-origin onboarding (beta-scope
  §2 item 5); the reference dApp now issues Passports rather than only
  reading profiles.

## Consequences

- The kernel and seam foundations (FS-0.3–0.8) move from parallel groundwork
  to the **beta critical path** — they need issues and plans before FS-2.3
  can be planned. The redirect fallback keeps the reference dApp shippable
  if the facade slips (beta-scope §5).
- `scripts/dependency-graph.mjs` gains `onboard` (edges: `core`, adapters,
  `protocol`, `contract`) and `adapter-browser` when FS-2.3 T2/T4 land; the
  boundary tests continue to assert `connect` has no transitive path to
  `core`.
- A new accepted residual risk enters the security register at
  implementation time: the partner origin transiently holds the plaintext
  device secret during issuance (mitigations: kernel zeroisation, ACC key
  rotation, curated origins).
- Open items carried by FS-2.3: a dedicated GitHub issue,
  challenge-verification topology, production RP ID + origins governance,
  and whether the PWA adopts the same bundled-ceremony shape.
