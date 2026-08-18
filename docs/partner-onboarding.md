# Partner-origin onboarding — issuing a Passport from inside a dApp

> **Status:** draft · 2026/08/18
> **Companion to:** [`sdk-requirements.md`](./sdk-requirements.md) (§3.13 is
> the requirement this doc details), [`architecture.md`](./architecture.md)
> (§4.4 packaging), [`provider-integration.md`](./provider-integration.md)
> (the proving and settlement rails every deploy rides), and
> [`dapp-connection.md`](./dapp-connection.md) (the conversational surface
> this deliberately is *not*).
> **Grounded in:** the confirmed experiment
> `experiments/passkey-prf-linking/` (findings 2026/08/17–18: Related Origin
> Requests, PRF continuity, and the largeBlob round-trip all verified,
> including on a real macOS authenticator).

## 1. The idea

Today a user becomes a Passport user inside the Passport PWA. This design
adds the second door: **a partner dApp issues the Passport itself.** The
user, on `nightfi.example`, taps "Create your Midnight Passport"; a passkey
is created **under the Passport RP ID** (a WebAuthn Related Origin Request);
their Account Custody Contract is deployed; and the deployed **ACC address is
stamped onto the credential** via the largeBlob extension. When the user
later opens the Passport PWA, one passkey ceremony re-derives the same key
material and reads the same credential — the account is *recognised*, not
re-created.

```text
One passkey · one identity root · issued anywhere · recognised at Passport
```

Three surfaces, one credential:

1. **Issue** (partner dApp): create passkey → deploy ACC → attach address —
   the **passkey/PRF (self-custody) path**, the one documented here (§3).
2. **Sign in** (partner dApp or Passport): one ceremony → key + ACC address.
3. **Managed variant** *(future iteration)*: a wallet-infrastructure
   provider supplies the authoriser and presence gate instead of the
   passkey-derived key — same ACC, same signer seam; its flow is **not
   documented yet** (§5).

The centre does not move: **identity is the ACC, not the key** (requirements
§1.1). The passkey is the shared authentication and discovery credential; the
blob on it is a bootstrap pointer; the chain remains the source of truth.

## 2. Packaging — a facade over the core, never a fork

The capability ships as **`@midnight-ntwrk/mn-passport-onboard`**: the
dApp-side issuance package. It is **composition only** — no custody, ceremony,
contract, or proving logic of its own:

- It **links `mn-passport-core`** and instantiates the kernel with the
  browser adapters: `Passport.create({ signer, prover, settlement, storage,
  platform })` per the FS-0.3 kernel and the FS-0.4–0.8 seams.
- It exposes a deliberately **narrow API** — `createPassport(...)` and
  `signIn(...)` — issuance and recognition only. No grants, no recovery, no
  device management, no asset surface: an externally issued account does
  *less* at the partner origin by design; the full lifecycle lives in the
  Passport PWA.
- **The `connect` rule is unchanged**: the conversational dApp package
  (`mn-passport-connect`) still never links `core`. `onboard` is the one
  recorded exception, and the reason is honest: **issuance is custody work.**
  A dApp that embeds `onboard` embeds the custody kernel for the duration of
  issuance — that is its threat model, stated plainly, not hidden behind a
  reimplementation (ADR 0005).

```mermaid
flowchart TB
  DAPP["Partner dApp"] --> ONBOARD["mn-passport-onboard — facade: createPassport · signIn"]
  DAPP -.-> CONNECT["mn-passport-connect — thin, C23 (unchanged: never links core)"]
  ONBOARD --> CORE["mn-passport-core — kernel + onboard/sign-in flows"]
  ONBOARD --> BROW["adapter-browser — Platform: WebAuthn/ROR ceremonies, fetch"]
  ONBOARD --> SIGNL["adapter-signer-local — PRF-derived authoriser"]
  ONBOARD -.-> SIGNM["adapter-signer-managed — provider authoriser (future iteration)"]
  ONBOARD --> PROVE["adapter-prover-remote — direct to the proving and sponsorship service"]
  CORE --> CONTRACT["mn-passport-contract — buildDeployArgs, bindings, loader"]
  CORE --> PROTO["mn-passport-protocol — RP ID · PRF salt · blob schema"]
  CONNECT --> PROTO
```

**Shared constants live in `mn-passport-protocol`** — its charter is exactly
"types and constants both sides compile against, no logic":

- `PASSPORT_RP_ID` — the Passport RP ID (e.g. `midnightpassport.com`;
  **config-overridable**, the domain may change — every ceremony API takes an
  optional `rpId`).
- `PRF_DEVICE_KEY_SALT` = `mn-passport/prf/device-key/v1` — this **fixes
  FS-0.8's provisional salt convention**: the partner package and the
  Passport PWA MUST evaluate the same salt or recognition breaks.
- The **largeBlob payload schema**, versioned and fixed-width:
  `{ v: 1, acc: 32-byte ACC address, binding: binding-version tag }` — types
  and constants only; the pure codec (`encodeBlob` / `decodeBlob`) lives in
  `core` (protocol ships zero runtime logic, architecture §4.4; both
  consumers of the codec — the facade and the Passport app — reach `core`).

## 3. Flow — issue (partner origin, passkey/PRF path)

> **This section documents the passkey/PRF (self-custody) path only.** The
> corresponding process for the **Provider (authoriser + routing)** — the
> managed path, where a wallet-infrastructure provider signs the
> authorisation and routes the proving payload
> ([`provider-integration.md`](./provider-integration.md)) — **will be
> documented in a future iteration** (§5). On this path there is **no
> provider in the loop**: the facade connects **directly** to the
> third-party proving and DUST sponsorship service.

Ceremony budget from the experiment findings: **two prompts**.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant DAPP as Partner dApp (onboard facade)
  participant KERNEL as core kernel (embedded)
  participant SVC as Third-party proving and DUST sponsorship (TEE)
  participant NET as Midnight node / indexer

  User->>DAPP: "Create your Midnight Passport"
  DAPP->>KERNEL: createPassport()
  KERNEL->>User: prompt 1 — create() under the Passport RP ID (ROR, bundled prf.eval)
  Note over KERNEL: PRF output = device secret (ephemeral)<br/>commitments via pureCircuits.derive_*_commitment
  KERNEL->>KERNEL: buildDeployArgs(commitments) — version-gated
  KERNEL->>SVC: sealed deploy payload (direct — sealed to the service's enclave key)
  Note over SVC: one process — prove, DUST-balance,<br/>sponsor fees, bind
  SVC-->>KERNEL: sealed, balanced deploy tx
  KERNEL->>NET: broadcast, await finalisation → ACC address
  KERNEL->>User: prompt 2 — get() bundling prf.eval + largeBlob.write(ACC address)
  KERNEL-->>DAPP: { account, credentialId, publicKey }
```

Notes:

- **Direct service connection.** The facade calls the third-party proving
  and DUST sponsorship service itself; the deploy preimage is **sealed to
  the service's enclave key before it leaves the device** (the §2.5 MUST,
  unchanged), the service proves, DUST-balances, sponsors, and binds in one
  process, and the SDK broadcasts. A zero-DUST user onboards from a partner
  origin because fees are sponsored. Provider *routing* of this payload
  belongs to the managed path and is out of scope here — the
  provider-integration topology decision ("the provider routes") applies to
  the managed path, not to this provider-less one.
- largeBlob writes are illegal at `create()`, so the second prompt is the
  spec floor; it doubles as the post-deploy confirmation gesture and carries
  the PRF evaluation for providers that do not return PRF at `create()`.
- A provider that drops PRF or largeBlob in a bundled ceremony is recorded as
  a measured finding and handled by the fallback ladder (§6) — never by
  silently adding prompts.

## 4. Flow — sign in (recognition)

**One prompt**, identical at a partner origin and at the Passport PWA: a
discoverable-credential `get()` bundling `prf.eval` + `largeBlob.read` →
re-derive the device key, decode the blob → `{ account, publicKey }`.

- **largeBlob is a cache, never the source of truth.** On a blob miss (the
  credential was issued where largeBlob is unsupported, or the provider does
  not store it — Google Password Manager and Windows Hello today) the flow
  falls back to an **indexer/registry lookup by device commitment**; on a
  hit, the account read from the blob is still verified against chain state
  (`detectDeployedVersion` + ACC read) before anything trusts it. Eviction or
  a stale blob degrades to discovery, never to failure.
- Providers that honour allowlisted assertions but do not enumerate
  discoverable credentials are mitigated the way the experiment did: the
  partner remembers its credential ID from issuance; Passport-side sign-in
  may also accept an explicit credential hint.

## 5. Flow — managed variant (future iteration)

> **TODO:** the managed flow — a wallet-infrastructure provider as the
> **authoriser + routing** party
> ([`provider-integration.md`](./provider-integration.md): the provider
> signs the per-operation challenge and routes the sealed proving payload)
> — **will be documented in a future iteration.** For now the onboard
> library implements only the passkey/PRF path (§3), connected directly to
> the third-party proving and DUST sponsorship service.

What the architecture already fixes, so the future iteration slots in
without redesign: the facade takes the same **signer seam** (FS-0.4) as the
rest of the SDK — `adapter-signer-local` fills it today (the PRF-derived
device secret, §3); `adapter-signer-managed` will fill it for the managed
variant. Same ACC, same facade API — requirements §2.1's progressive
decentralisation as a configuration choice, and migration between the two is
an authoriser swap on the ACC, as everywhere else.

## 6. Where this does not work — the fallback ladder

From the experiment's measured compatibility floor (2026/08/18; re-verify per
C9 on hardware):

| Constraint | Consequence | Fallback |
|---|---|---|
| ROR floor — iOS < 18 / Safari < 18, Chrome/Edge < 128, Firefox < 152 | partner-origin ceremonies fail (`SecurityError`) | **redirect to the Passport PWA** (first-party onboarding over the C23 surface) — mandatory in every integration |
| No PRF (e.g. Windows below 11 25H2) | no derivable device key at the partner origin | managed variant (§5), or redirect |
| No largeBlob (Google Password Manager, Windows Hello) | no attached pointer | indexer/registry lookup by device commitment (§4) |
| No passkeys at all (no platform authenticator enrolled) | nothing WebAuthn works | managed variant or redirect; the §2.2 password/KDF ceremony exists for exactly this population |
| ~5-label cap on the ROR origins list | partner set is **curated**, not open | growth beyond the cap uses the C23 connection surface, not ROR |

The full flow (ROR + PRF + largeBlob) exists today on Apple platforms
(iOS 18 / macOS 15+, practically 18.4+); Android gets ROR + PRF without the
blob; Windows trails. The facade MUST expose capability detection so a dApp
can choose the right door before prompting the user.

## 7. Security framing (normative)

- **The origins list is a governed security surface.** Every listed origin
  can run ceremonies against Passport credentials; the well-known file is
  fetched per ceremony, so listing is a security decision with a recorded
  process, and removal is instant revocation (proven by the experiment's
  negative control).
- **The partner origin transiently holds the device secret at issuance.**
  The PRF output materialises inside the embedded kernel in the dApp's JS
  context. Onboarding through a partner therefore trusts that partner with
  the *initial* device key. Mitigations: kernel zeroisation after use; the
  ACC's key-rotation model (identity is the ACC — the user can add a clean
  device and retire the issuance key from the Passport PWA); the curated
  origins list. Accepted residual risk, recorded in the security register.
- **Challenge verification topology is open.** Sign-in assertions must be
  verified against a challenge someone issued — Passport-side verification
  service vs in-circuit assertion verification (once secp256r1 lands) is an
  open item carried by the spec, not decided here.
- All existing MUSTs hold unchanged: ceremony gate before witness use
  (§2.2), preimage encrypted to the enclave on remote proving (§2.5),
  deposit-not-address (§3.12), and the two version axes (§4.6) — the blob's
  `binding` field exists so recognition can route to the right contract
  bindings.

## 8. Open items

- Dedicated GitHub issue for FS-2.3 (currently anchored to
  midnightntwrk/passport#77, C27 Passport Facade).
- The managed (provider authoriser + routing) flow — future iteration (§5).
- **Sponsorship policy for direct, provider-less deploys**: what authorises
  the third-party service to sponsor DUST for a call that arrives without a
  provider in front of it (per-partner credentials, rate limits, or open
  sponsorship)?
- Challenge-verification topology (§7).
- The RP ID's production value and the origins-list governance process
  (who approves a partner, where the file is served and monitored).
- Whether the Passport PWA's own onboarding adopts the same two-prompt
  bundled-ceremony shape (it should — one implementation in `core`).
- Indexer lookup shape for the blob-miss fallback (feeds the FS-0.6 open
  question on a read-side indexer seam).
