# Midnight Passport SDK architecture

> **Status:** draft · 2026/10/19
> **Owns:** the packages, the seams, the adapters, and the dependency rules of
> the SDK.
> **Companions:** [`sdk-requirements.md`](./sdk-requirements.md) (what the SDK
> must do, and the version axes in rule 5) and
> [`roadmap.md`](./roadmap/roadmap.md) (what beta contains).

## Summary

- The SDK has **three entry libraries** on a **shared foundation**. `core` is
  the engine of the Passport app. `connect` is the dApp library.
  `mn-passport-agent` is the agent library.
- **After V1**, a fourth entry library, `mn-passport-ecosystems`, shows
  Passport in the wallet pickers of other chains, such as Solana and EVM
  chains.
- The foundation has three packages: `mn-passport-account` (the ACC client and
  the shared seams), `mn-passport-contract` (bindings and artifacts), and
  `mn-passport-protocol` (wire messages).
- **`connect` and `mn-passport-agent` never link `core`.** Code that more than
  one entry library needs goes into `mn-passport-account`.
- Most seams live in `mn-passport-account`, so that the three entry libraries
  share one prover, one broadcast client, and one key-provider interface.
  Storage, recovery, and DID stay behind `core`.
- **Transaction in, proof out.** The prover gets the unproven transaction and
  holds the proving keys. In V1, the prover sees the private inputs of each
  proof, for example the coin and the amount. The user is told.
- After the grant and the handoff, a dApp or an agent operates with the
  Passport app closed. It signs with its own grant key, never through Passport.
- **A dApp never onboards a user.** It sends a new user to the Passport app.
  The app onboards the user and issues the grant of the dApp in the same visit.
- **Owner keys come only from the Passport app.** At account creation, the
  passkey of the device becomes the first owner key. The user can add a WaaS
  key as a backup owner key. Each dApp makes its own scoped grant key.
- **A user never holds DUST.** A sponsor pays the fees, or the user swaps for
  them through the Capacity Exchange.

## The package map

![Midnight Passport SDK package map](./proposals/assets/2026-09-25-sdk-packages.svg)

_The entry libraries depend on the foundation. The shared adapters implement
seams from `mn-passport-account`, and the registry adapter implements a seam
from `mn-passport-contract`. The Passport-app adapters implement seams from
`core`, and only `core` uses them._

## Design approach

The requirements fix three ingredients: typed packages with a clean split, a
kernel secret boundary, and a reactive state model. The approaches differ only
in how many of them V1 adopts.

| Approach | Shape | Verdict |
|---|---|---|
| 1. Thin typed wrappers | Typed bindings and injected providers. No kernel, no reactive surface. | Rejected as a target. It does not contain secrets or discipline state. |
| 2. Layered core and adapters | A minimal kernel boundary, seams as adapter packages, observable reads, and imperative writes | **V1.** |
| 3. Kernel, adapters, and a command bus | Each mutation goes through one pipeline: authorize, build, prove, broadcast, confirm. | The target end state. |

V1 builds approach 2 with seams that already have the approach 3 shape. Thus,
approach 3 is an evolution, not a rewrite.

## Packages

All packages publish under the `@midnight-ntwrk/` scope.

### Entry libraries

| Package | Runs in | What it does |
|---|---|---|
| `mn-passport-core` | The Passport app (browser) | Onboarding, devices, grant issuance and revocation (the authorizer page of MIP §9), and recovery. It also onboards a new user who arrives from a dApp, and then issues the grant of that dApp (example 2). It keeps private data through WPP and gives out the viewing key. It recognizes an account from the passkey and its largeBlob. It is not on the path of a dApp or an agent. |
| `mn-passport-connect` | A dApp (browser) | The grant ceremony with the browser profile. The per-origin key provider. The signature of the ACC challenge with the grant key. The private-data handoff, then a private-state provider over the WPP package of the dApp. Pay with Passport. It never onboards a user: it sends a new user to the Passport app (example 2). |
| `mn-passport-agent` | An agent backend (Node.js) | The grant ceremony with the agent profile. OWS as the key provider. On-chain grant reads, so that OWS can enforce the grant as its policy. A registry client that gets and runs the circuit of a dApp. |
| `mn-passport-ecosystems` | A dApp on a different chain (browser) | **After V1.** It registers Passport in the wallet standards of other chains: `/solana` for the Solana Wallet Standard, and `/evm` for EIP-6963 and EIP-1193. It holds no key. It sends each request to the Passport app (example 8). |

### Foundation

| Package | What it does |
|---|---|
| `mn-passport-account` | The ACC client that the three entry libraries share. It builds and signs ACC challenges for each arm, and it reads grants on chain. It has the grant-ceremony client, the coin store, the inbox codec, payments, the transaction joiner, and the grant-scope helpers. It defines the shared seams. |
| `mn-passport-contract` | Typed bindings over the published ACC artifact, the version registry, and the integrity checks. It loads the compiled module, the ledger decoder, and the manifest. It loads the ZKIR only for a client that verifies circuits. It accepts a partly deployed account. It publishes the interface of the ACC for dApp circuits, and it defines the registry seam. |
| `mn-passport-protocol` | The MIP §9 messages: the grant request, the possession proof, the redirect response, and the sign-in message (MIP §10). It also carries the shared constants: the RP ID, the PRF salt, and the largeBlob schema. It carries the guardian messages of MIP-0022 §7 and the recovery tags too (section "Recovery"). Types and constants only, with no logic. |

## Seams

A seam is an interface with interchangeable adapters. A seam that more than one
entry library uses lives in the foundation.

| Seam | Shape (indicative) | Defined in | Used by | Implemented by |
|---|---|---|---|---|
| Key provider | `scheme`, `envelope`, `publicKey()`, `sign(challenge)` | `account` | All three | The key providers below |
| Prover | `prove(unprovenTx, circuitIds) → provenTx` | `account` | All three | `adapter-prover-remote` |
| Broadcast | `broadcast(provenTx)`, then monitor until final | `account` | All three | `adapter-broadcast` |
| Fees | A sponsor pays, or a Capacity Exchange swap | `account` | All three | `adapter-broadcast` (sponsor), `adapter-fee-capacity-exchange` |
| Platform | Network, WASM load order, WebAuthn or its Node.js equivalent | `account` | All three | `adapter-browser`, `adapter-nodejs` |
| Private state | The midnight-js `PrivateStateProvider` | `account` | `connect` (agents: open) | `connect`, over the WPP package of the dApp |
| Account metadata | Namespaced, versioned entries; read, merge, write, read back | `account` | `core` | `adapter-waas` |
| Registry | Get dApp artifacts by content hash, and verify them | `contract` | `mn-passport-agent` | The registry adapter |
| Multi-chain | Submit an authorized intent for a different chain, then report its settlement or its failure | `account` | All three | `adapter-multi-chain` |
| Storage | Ciphertext only: WPP packages, catalogs, conflict retention, backup states | `core` | `core` | `adapter-storage-wpp` |
| Recovery | Send share requests, collect share responses and liveness attestations, over a confidential and authenticated channel | `core` | `core` | `adapter-recovery` |
| DID | Create, link, sign, and resolve `did:midnight` | `core` | `core` | `adapter-did` |

### Key providers

A key provider holds a private key and signs an ACC challenge. The holder of a
key makes the key, and the Passport app registers it as a device (full
authority) or as a grant (scoped authority).

```ts
// Indicative shape; signatures are fixed when the package is specced.
interface KeyProvider {
  readonly scheme: 'jubjub' | 'k256' | 'p256';
  readonly envelope?: 0 | 1; // k256 only
  publicKey(): Promise<Uint8Array>;
  sign(challenge: Challenge): Promise<Authorization>;
}
```

| Key provider | Scheme | Usual registration | Lives in |
|---|---|---|---|
| Passkey | JubJub, from the PRF output | Device | `core` |
| Passkey on secp256r1 | p256, `wa-json134` WebAuthn profile only | Device or grant | `core`, `connect` |
| Embedded wallet of a WaaS provider | k256, envelope 0 | Device: an optional backup owner key | `adapter-waas` |
| Midnight connector wallet | k256, envelope 1 (`signData` with `ecdsa_secp256k1_sha256`) | Device, or a read-only grant | `core`, `connect` |
| dApp per-origin key | JubJub, k256 (envelope 0), or p256 | Grant | `connect` |
| Agent key in OWS | JubJub or k256 (envelope 0) | Grant | `mn-passport-agent` |
| EVM wallet | k256, EIP-191 | **After V1.** Device or grant | `core`, `connect` |
| Solana wallet | Ed25519 | **After V1.** Device or grant | `core`, `connect` |

[`sdk-requirements.md`](./sdk-requirements.md) owns the exact signing digests.

An external wallet can sign for the ACC only on an arm that the ACC verifies.
The EVM wallet needs a new k256 envelope for EIP-191, and the Solana wallet
needs an Ed25519 arm. The contract team adds these arms. Then the key-provider
interface gets the new scheme or envelope.

## Adapters

Each adapter implements one seam. It depends only on the package that defines
the seam and on its own provider SDK.

### Shared adapters

dApps and agents need these adapters too. Thus, they implement seams from the
foundation, never from `core`.

| Adapter | Seam | Note |
|---|---|---|
| `adapter-prover-remote` | Prover | Transaction in, proof out. The prover holds the proving keys, or makes them again from the ZKIR and the on-chain verifier key. |
| `adapter-broadcast` | Broadcast, fees | Gives the proven transaction to the sponsor, which pays the fees and broadcasts it. Monitors until final, with bounded waits and resubmission. |
| `adapter-fee-capacity-exchange` | Fees | The other fee route: a swap through the Capacity Exchange. Planned for later. |
| `adapter-browser` | Platform | The browser runtime: passkeys with PRF and the two WASM runtimes in the correct order. |
| `adapter-nodejs` | Platform | The Node.js runtime for backends, `mn-passport-agent` included. |
| `adapter-waas` | Key provider, account metadata | The embedded key of a WaaS provider (k256, envelope 0) and the metadata on it. It names no vendor. Only `core` uses it, because this key is an optional backup owner key with full authority. It enrolls the key only when the provider isolates it to the Passport app. It never writes the viewing key or the WPP account key in readable form (the kernel invariant). |
| Registry adapter (name open) | Registry | Content-addressed fetch, verification, and a local cache. It makes the verifier key again from the ZKIR and the SRS, and compares it with the key on chain. |
| `adapter-multi-chain` | Multi-chain | **After V1.** It connects to a multi-chain signature network. The network signs for the ACC on other chains, after the ACC authorizes the intent. |
| `adapter-prover-wasm` | Prover | **After V1.** ACC proving keys are 112–224 MB, and the zkir WASM package has no key generation. |

### Passport-app adapters

Only `core` uses these adapters.

| Adapter | Seam | Note |
|---|---|---|
| `adapter-storage-wpp` | Storage | The storage adapters of WPP, with Google Drive first. |
| `adapter-recovery` | Recovery | The guardian transport of MIP-0022 §7. It carries sealed messages only. The recovery secret and the shares in plaintext stay in the kernel (section "Recovery"). |
| `adapter-did` | DID | A wrapper over `midnight-did-api`. It makes the DID with the account and links it to the ACC. |

## Dependency rules

1. An entry library depends on the foundation. The foundation never depends on
   an entry library.
2. `mn-passport-account` depends on `mn-passport-contract` and
   `mn-passport-protocol`. These two depend on no other SDK package.
3. **`connect` and `mn-passport-agent` never link `core`**, and never link a
   Passport-app adapter. Shared code goes into `mn-passport-account`.
4. `mn-passport-ecosystems` depends only on `mn-passport-protocol`. It never
   links `core`, `mn-passport-account`, or an adapter, so that a dApp on a
   different chain loads only a small package.
5. A shared adapter depends on the package that defines its seam, and on its own
   provider SDK. It never depends on `core` or on a different adapter.
6. A Passport-app adapter implements a seam from `core`. Only `core` uses it.
7. `core` and the foundation hold no platform code (`fs`, `window`, `fetch`).
   The platform adapters supply it.
8. The SDK never compiles or owns the ACC. It consumes the published artifact.

The workspace lint and the manifest test enforce these rules on each change.

## The core kernel invariant

The kernel in `core` is the only code that holds these secrets in plaintext:

- the PRF output of the passkey, and the JubJub device key derived from it;
- the WPP keys of the account: the account key, and the package keys derived
  from it;
- the viewing key;
- the recovery secret `s`, only during a session or a recovery (section
  "Recovery");
- the guardian secret, when this user acts as a guardian, only during one
  share response.

### Passkey devices: two arms

A passkey can act as a device on two arms of the ACC. The arms differ in what
reaches the code of the Passport app.

| | JubJub arm (PRF) | p256 arm (`wa-json134`) |
|---|---|---|
| Signing key | A JubJub key that the kernel derives from the PRF output | The credential key of the passkey |
| Where the key lives | In the memory of the kernel, for one operation only | In the authenticator. It never leaves it. |
| What reaches the page | The PRF output, after a user tap | A WebAuthn assertion (a signature) only |
| Exposure | Code that runs in the Passport app origin during the operation | None in the page |
| Limits | The authenticator must support PRF | Exactly 134 bytes of `clientDataJSON` and a 21-byte origin |

On the JubJub arm, the kernel derives the key, signs, and then discards the PRF
output and the key. It never stores or sends them. The p256 arm gives a
stronger boundary, because no secret enters the page.

A device from a WaaS provider is outside the kernel. The provider holds that
key, and the kernel gets only its signatures. Passport enrolls such a key only
as a backup owner key, and only if the provider isolates it to the Passport app
(the rules below).

### What leaves the kernel

No secret leaves the kernel. Only these items, derived from the secrets, leave
it:

| Item | To | Condition |
|---|---|---|
| A signature over an ACC challenge | The prover, inside the transaction | A device operation in the Passport app |
| The unproven transaction | The V1 prover | The prover sees the private inputs of each proof, for the ACC and for each dApp circuit. The user is told. |
| A key for one WPP package | One dApp | At the handoff, after a passkey tap and a separate consent. It opens only the package of that dApp. |
| Ciphertext | WPP storage | Always |
| A guardian share, sealed to the requesting owner | The owner, through `adapter-recovery` | After a passkey tap and an explicit confirmation of the account |
| Two signatures: one under `s`, one under the successor device key | The prover, inside `recover_submit` | A recovery. The prover learns no scalar (MIP-0022 REC-11). |
| The ACC address, and the viewing key and the WPP account key only as ciphertext | The metadata of an isolated WaaS backup key | Each origin of the provider can read it. Only the Passport app can get the key of that ciphertext. |

The viewing key is the one exception: it leaves the kernel whole. It goes to a
holder of a read grant, after a separate consent. Its lifecycle follows
scoped-grants MIP §8:

- **Rotate before share.** Before Passport issues a grant with read access, it
  calls `rotate_enc_key` and re-encrypts the live holdings into new inbox
  entries. Thus, the holder reads current and future holdings, not spent
  history.
- **Re-seal after each rotation.** A rotation blinds each other holder of a
  read grant. Passport re-seals the new key to each of these grants, or it
  marks them as needing reconnection and shows this to the user.
- **Revoke.** When Passport revokes a read grant, it rotates, re-encrypts the
  live holdings, and re-seals to the remaining holders. The revoked holder
  keeps what it already read. The consent screen says this in advance.

The spec of the read-grant lifecycle owns partial completion and cost.

The metadata of a WaaS backup key never holds the viewing key or the WPP
account key in readable form. Each origin of the provider can read that
metadata. Thus, Passport keeps these keys out of it, or encrypts them under a
key that only the Passport app can get. A dApp gets the viewing key only
through a read grant. Only the Passport app writes that metadata. Passport
binds each entry to the ACC address and the key versions, and it refreshes the
entry after each rotation
([`provider-integration.md`](./provider-integration.md)).

These rules complete the invariant:

- **The ceremony gate.** A passkey tap occurs when Passport issues a grant and
  when the handoff completes. There is no tap for each call. The exception is a
  grant key that is itself a passkey on the origin of the dApp. A request from
  a dApp on a different chain also gets its own tap (example 8).
- **No device key in a dApp or an agent.** The code of a dApp or an agent
  holds only its grant key, and it never drives a device key (example 2).
- **A WaaS key becomes a backup owner key only when the provider isolates
  it.** The
  provider gives Passport a key or session that no other origin can use. As
  an alternative, the provider enforces a signing policy. That policy refuses
  each ACC owner operation from another origin. Without one of these, Passport
  does not enroll the key. The `adapter-waas` spec has a negative acceptance
  check. After enrollment, a dApp session with the same provider cannot get a
  signature for an owner operation, for example `add_device`.
- **Encryption to an enclave** becomes mandatory when a trusted-hardware prover
  exists. Until then, the disclosure above applies.

## Security boundaries

```mermaid
flowchart TB
  subgraph APP["Passport app (trusted)"]
    KERNEL["core kernel<br/>PRF output · WPP keys · viewing key"]
  end
  subgraph CLIENTS["dApps and agents (untrusted)"]
    DAPP["dApp + connect<br/>grant key only"]
    AGENT["agent + mn-passport-agent<br/>OWS grant key only"]
  end
  subgraph EXT["External services"]
    PROVER["Prover<br/>sees the private inputs"]
    SPONSOR["Sponsor<br/>pays fees, broadcasts"]
    WAAS["WaaS provider (optional)<br/>backup owner key, isolated to the Passport app,<br/>no readable viewing key"]
    WPP["WPP storage<br/>ciphertext only"]
    IDX["Indexer<br/>sees what the viewing key opens"]
    GUARD["Guardians<br/>their own shares only"]
  end
  ACC[("The user's ACC<br/>enforces devices and grants")]

  KERNEL -->|"issue_grant, add_device"| ACC
  KERNEL -.->|"handoff: scoped package key,<br/>viewing key if read access"| DAPP
  KERNEL -->|"ciphertext"| WPP
  DAPP -->|"grant-scoped calls"| ACC
  AGENT -->|"grant-scoped calls"| ACC
  DAPP -->|"package ciphertext"| WPP
  GUARD <-->|"sealed share requests and responses"| KERNEL
  DAPP --> PROVER
  AGENT --> PROVER
  PROVER --> SPONSOR
  SPONSOR --> ACC
  WAAS -->|"signs as a backup owner"| ACC
```

Each external service carries the one trust assumption in its label. If the
user enables the backup owner key, the WaaS provider needs the most trust: the
account is only as safe as the signing security of the provider, and Passport
tells the user this.

The ACC is the last line of defense. It checks each grant on each call: the
operations, the token color, the caps, the coin bound, the recipient pin, the
caller pin, and the expiry.

## Recovery

Total-loss recovery lets a user who lost every device get control of the same
ACC again. MIP-0022 owns the protocol. This section says where each part
lives in the SDK, and what the SDK must enforce because the contract cannot.

### How it works

The user chooses guardians and a threshold, for example "any 3 of my 5".
Guardians store nothing. Each guardian computes its share again on request,
from a secret that it already holds:
`sigma = H(share tag, session id, account, guardian secret)`.

| Guardian profile (MIP-0022 §3) | Guardian secret | Needs Passport |
|---|---|---|
| A: passkey | The PRF output of the guardian's passkey, under the registered guardian salt | Yes |
| B: cold signer | The hash of a deterministic signature (RFC 6979, or BIP-340 with zero auxiliary randomness) over the session binding | No |
| C: paper key | A random field element, printed at enrollment and kept by no device | No |

One roster can mix the three profiles.

**Session** (set-up, and each change to the roster or the threshold):

1. The kernel samples a fresh recovery secret `s` and a fresh session id.
2. `adapter-recovery` sends a `ShareRequest` to every guardian in the roster.
   Each guardian answers with a `ShareResponse`.
3. The kernel computes the public shares `phi`, the commitment `P = s * G`,
   and the wrap of the viewing key under a key derived from `s`.
4. After a passkey tap, `core` calls `publish_recovery_session` with the
   artifact set. Then the kernel discards `s`.

**Recovery** (every device is lost):

1. On a fresh device, the user makes a new passkey. Its JubJub key is the
   successor device key `Q`.
2. `adapter-recovery` gets `t+1` shares from guardians. The user types in
   paper keys.
3. The kernel reconstructs `s` and checks it against `P` locally. Then, at
   once, it decrypts the viewing key, samples the successor secret `s'`,
   signs the submission challenge with `s` and with `Q`, and discards `s`.
4. `core` calls `recover_submit` through the prover and the sponsor. The
   prover sees two signatures only, never `s` (REC-11).
5. The veto window runs. It is measured in days. Any enrolled device can call
   `recover_cancel`.
6. After the window, `core` (or anyone) calls `recover_finalise`. It retires
   every old device, enrolls `Q` as the only device, rotates the commitment
   to `P'`, and clears `phi`.
7. The account has no recovery backup now. `core` warns the user and asks for
   a new session at once.

Assets never move. Recovery changes who can authorize, not where the assets
are. The viewing key comes back from the wrap, and with it the coin store.
The private data of dApps comes back only through WPP key recovery
(requirements, section "Recovery").

### Where each part lives

| Part | Package | Holds a secret |
|---|---|---|
| `s`, the guardian secret, reconstruction, the local check, the wrap, the signatures under `s` and `Q` | `core` kernel | Yes |
| The session, guard, recover, cancel, finalize, and liveness flows; the roster record; the roster policy below | `core` | Through the kernel only |
| The guardian transport | `adapter-recovery` | No. Sealed messages only. |
| The MIP-0022 §7 messages, the four recovery tags, the guardian PRF salt | `mn-passport-protocol` | No |
| Bindings for the recovery circuits, the challenge hash, and the artifact-set version | `mn-passport-contract` | No |

`core` runs only in the Passport app, and `connect` and `mn-passport-agent`
never link it (dependency rule 3). Thus, no dApp or agent bundle contains
recovery code. The BUSS arithmetic comes from the Pleiades library through
`buss-wasm`, which the platform adapter loads into the kernel.

### What the SDK must enforce

The contract checks only what it can see. These rules are client
obligations in MIP-0022, so the kernel enforces them:

1. **Fresh `s` and fresh session id for each session** (REC-4). A reused id
   lets a quorum open two sessions. With `2t+2` guardians, two correlated
   sessions give `s` to anyone who reads the chain. The on-chain inequality
   check only catches an accident.
2. **Every guardian in the new roster answers.** There is no partial update.
   A removed guardian is removed because `s` changes (REC-5).
3. **`s` is never at rest** (REC-6). It exists only during steps 1–4 of a
   session and step 3 of a recovery. It never goes to a screen, a log, or
   an adapter. A paper key is shown once, at enrollment, after a passkey tap.
4. **Check before submit.** A lying guardian shows only as a failed check
   against `P`. The kernel tries other `t+1` subsets. It does not spend a
   transaction on a wrong `s`.
5. **Reject an unknown artifact-set version.** A misparsed `phi` looks the
   same as a roster that is too small.
6. **A for-cause session rotates the viewing key** and re-encrypts the live
   inbox entries, because a past quorum can still open the old wrap.

### Security model

MIP-0022 protects `s` from parties outside the client:

- Fewer than `t+1` guardians learn nothing about `s`.
- The chain shows the artifact set and the session timing only: no guardian
  identity, key, or channel.
- No service holds shares, so there is no share store to breach.
- A recovery cannot move assets.
- The prover cannot learn `s` or change the successor (REC-11).

It does not protect `s` from the client. The kernel samples `s`,
reconstructs it, and enforces the rules above. The SDK already holds the
device key, so a compromised SDK already controls the accounts it runs.
Recovery adds three risks that the device path does not have:

1. **A backdoor that outlives the compromise.** A malicious build can publish
   a session with an `s` that the attacker knows. `P` does not show this. The
   backdoor survives a fixed SDK, new devices, and new passkeys, until the
   next session.
2. **Guardians that share one code base.** A profile A guardian secret is a
   PRF output, and it is the same for every session. A malicious Passport app
   build can ask for the guardian salt during any tap that a user makes for
   another reason. It then has that guardian's shares for every account it
   guards, now and in the future. One release can thus act as `t+1`
   colluding guardians, across many accounts at once.
3. **Share requests at scale.** Each Passport app answers share requests for
   other accounts. "Your friend needs help to recover" is a cheap phish.

The veto window helps only while a device survives. In total loss it is a
delay and an alarm, and the guardian quorum is the root of trust (MIP-0022,
Security Considerations). Thus, the SDK adds these controls:

| Control | Against |
|---|---|
| **Roster diversity.** By default, `core` refuses a roster in which profile A guardians alone can reach `t+1`. Each quorum must include a profile B or C share, which a software compromise cannot reach. An override exists. It needs a passkey tap, states the risk, and goes into the roster record. | Risk 2 |
| **People, not credentials.** `core` warns when guardian credentials share a person, a provider, or a place (MIP-0022 people-counting rule). | Risk 2 |
| **The roster record names the SDK version** that ran the session. Each release carries a signed list of revoked versions. A session made by a revoked version forces a new session. | Risk 1 |
| **A deliberate guard flow.** Each share response needs a passkey tap. It shows the account and how the request arrived. The guardian secret is derived for that response only, and never cached. The PRF call for the guardian salt happens only in this flow. | Risks 2 and 3 |
| **Sealed, authenticated transport.** A share goes only to an authenticated owner, sealed to the request (MIP-0022 §7). | Interception, risk 3 |
| **Alarms.** Each enrolled device watches for a pending recovery. The guard flow watches the accounts that its user guards, and alerts the guardian to a submission. Repeated submissions show that `s` is known, so `core` proposes a new session. | All three, and denial of service against the window |
| **Clear signing for profile B.** The signer shows the account and the session before it signs. | A malicious client that asks for a share for a different session |
| **Signed, reproducible builds** of `core` and `buss-wasm`, with exact pins and the 7-day cooldown. Pleiades is audited and published before release. | The supply chain |

The client stays trusted after these controls. They make a client-side
attack detectable, and they keep one compromised build from reaching a
quorum.

### Open questions

- **The roster record.** It is not secret, and it must survive total loss.
  It cannot live only in WPP, because the WPP keys are lost too. Options:
  printed with the paper keys, in the WaaS metadata, or an exported file.
- **Liveness attestation.** MIP-0022 makes it a MUST. The cadence and the
  user experience are open.
- **The successor key scheme.** The reference gate is JubJub only. A p256
  passkey cannot be the successor device yet.
- **Who calls `recover_finalise`.** The successor device, or the sponsor.
- **Pending upstream work.** The proof and node validation of the device-set
  reset (#183), and the CRYPTO-MEMO answers (Q1–Q7).

## Library composition examples

> **Indicative API.** The snippets show which library does what. Signatures are
> not fixed; each package spec fixes them.

### Example 1: onboarding in the Passport app

```ts
import { PassportApp, passkeyKeyProvider } from '@midnight-ntwrk/mn-passport-core';
import { browserPlatform } from '@midnight-ntwrk/mn-passport-adapter-browser';
import { remoteProver } from '@midnight-ntwrk/mn-passport-adapter-prover-remote';
import { sponsoredBroadcast } from '@midnight-ntwrk/mn-passport-adapter-broadcast';
import { wppStorage } from '@midnight-ntwrk/mn-passport-adapter-storage-wpp';

const app = await PassportApp.create({
  platform: browserPlatform(), storage: wppStorage(),
  prover: remoteProver({ url: proverUrl }), broadcast: sponsoredBroadcast({ url: sponsorUrl }),
});

const account = await app.onboard({ device: passkeyKeyProvider(), name: 'alice' });
```

`core` deploys the ACC in waves. The deploy planner packs the circuits within
the 15,000-byte verifier budget, so the wave count comes from the artifacts.
Then `core` activates the passkey as the first device and claims the name. The
prover proves each wave, and `adapter-broadcast` gives it to the sponsor.

The user can then opt in to a backup owner key: the embedded wallet of a WaaS
provider. This key has the same authority as the passkey, and it works alone.
Thus, it adds trust in the provider, and the app tells the user this. The app
enrolls it only if the provider isolates it to the Passport app.

If the user loses the passkey, the user signs in to the Passport app with the
provider. Then `core` restores three things:

- signing: the backup key approves a new passkey (`add_device`);
- the viewing key, from the metadata of the provider;
- the private state: the WPP account key, from the same metadata.

### Example 2: a new user who arrives from a dApp

```ts
import { PassportConnect } from '@midnight-ntwrk/mn-passport-connect';

const passport = PassportConnect.create({ platform, prover, broadcast });

// The user has no Passport yet. The dApp sends the usual grant request (example 3).
await passport.requestGrant({ operations: ['withdraw_shielded_to_contract'], color: NIGHT, perCall: 10n, total: 100n });

// Back from the redirect: the new account exists, and it holds the grant of the dApp.
const session = await passport.completeConnection();
```

A dApp never onboards a user. The authorizer page of the Passport app finds no
account for the user, so `core` onboards the user first, as in example 1. The
user makes a passkey there, and it becomes the first device. Then, in the same
visit, `core` issues the grant to the per-origin key of the dApp that sent the
request. The redirect takes the user back to the dApp with the grant response.

The first device has full authority. If the page of a dApp drives that key, a
malicious dApp can make the key sign more than the activation, for example
`add_device`. Thus, only the Passport app drives a full-authority key, and a
dApp holds only its grant key.

### Example 3: connect, a joined call, and independent operation

```ts
import { PassportConnect } from '@midnight-ntwrk/mn-passport-connect';
import { joinIntents } from '@midnight-ntwrk/mn-passport-account';

const passport = PassportConnect.create({ platform, prover, broadcast });

// 1. Redirect to the Passport authorizer page (browser profile).
await passport.requestGrant({ operations: ['withdraw_shielded_to_contract'], color: NIGHT, perCall: 10n, total: 100n });

// 2. Back from the redirect: verify the grant on chain and take the handoff.
const session = await passport.completeConnection(); // grant, private state, viewing key if read access

// 3. Passport can close now. The dApp builds both parts first. It submits neither alone.
const accSpend = await session.grantSpend({ amount: 10n, to: dappContractAddress }); // part 1: withdraw_shielded_to_contract
const dappCall = await session.buildCall(dappContract, 'claimAndRun', args); // part 2: the dApp's own circuit, not submitted

// 4. Join the two parts, then prove and submit the joined transaction once.
await session.submit(joinIntents(accSpend, dappCall)); // write-back only after SucceedEntirely
```

After the redirect, `connect` reads the grant on chain and verifies the scope
and the key binding. The handoff gives the dApp a scoped key for its own WPP
package, and `connect` wraps it as a private-state provider.

A called contract cannot run a witness. Thus, a shielded spend from the ACC
starts its own intent. The spend uses `withdraw_shielded_to_contract`, because
the coin goes to the contract of the dApp. The dApp builds both parts before it
submits anything. Then the transaction joiner adds the intent of the dApp
(`addIntent`, never `merge`), and the dApp submits the joined transaction once.
The dApp composes the call; the SDK supplies the
ACC interface, the challenge, and the grant signature. The dApp writes its new
state to WPP only after `SucceedEntirely`. If the write fails, the state stays
local and the dApp tries again. [`sdk-requirements.md`](./sdk-requirements.md)
(section "dApps") and realignment §8.2 own the full flow.

### Example 4: an agent call

```ts
import { PassportAgent, owsKeyProvider } from '@midnight-ntwrk/mn-passport-agent';
import { nodePlatform } from '@midnight-ntwrk/mn-passport-adapter-nodejs';
import { registry } from '@midnight-ntwrk/mn-passport-adapter-registry'; // name open

const agent = PassportAgent.create({
  key: owsKeyProvider(owsWallet), platform: nodePlatform(), registry: registry(), prover, broadcast,
});

const request = await agent.requestGrant({ label: 'Rebalancer', scope }); // show as a QR code or a link
await request.approved(); // the readable scope and its salt

const circuit = await agent.loadDappCircuit(contentHash); // verified against the on-chain verifier key
await agent.call(circuit, 'rebalance', args); // reads the grant status first
```

The agent profile binds the agent key with a self-signature, a nonce, an
expiry, and a label. It has no web origin. The Passport app shows that it
validates an agent request. Before OWS signs, `mn-passport-agent` reads the
grant on chain, so that OWS enforces the grant as its policy. The agent then
operates with the Passport app closed.

### Example 5: a payment to a shielded address

```ts
import { pay, parseShieldedAddress } from '@midnight-ntwrk/mn-passport-account';

// The coin key and the encryption key come from one parse.
await pay(account, { to: parseShieldedAddress(address), color: NIGHT, amount: 25n });
```

`pay` calls `withdraw_shielded_*`. The circuit takes the coin public key, and
midnight-js needs the encryption public key to build the note for the
recipient. Both halves come from one parsed address, never from two sources.
Before the spend, the coin store reads the position of the change coin from the
indexer. A payment to an unshielded `mn_addr` address calls
`withdraw_unshielded_*`.

### Example 6: a payment to another Passport

```ts
import { pay, resolvePassport } from '@midnight-ntwrk/mn-passport-account';

const recipient = await resolvePassport('bob.passport.night'); // the ACC address
await pay(account, { to: recipient, color: NIGHT, amount: 25n });
```

A payment to an account is a deposit, never a transfer to a raw address. From a
Passport, `pay` joins `withdraw_shielded_to_contract_*` with the
`deposit_shielded` of the recipient in one transaction. It seals a 192-byte
inbox entry to the `enc_key` of the recipient. It reads that key at the time of
the seal, and again on each retry. The transaction publicly links the two
accounts. Unshielded value goes in through `deposit_unshielded`.

### Example 7: the protocol messages

`mn-passport-protocol` has no runtime. Both sides of the grant ceremony compile
against its types, so they cannot drift apart.

```ts
// @midnight-ntwrk/mn-passport-protocol: types and constants only
export const PROTOCOL_VERSION = 2;

export type Binding =
  | { profile: 'browser'; origin: string; possessionProof: PossessionProof }
  | { profile: 'agent'; agentKey: PublicKeyRef; nonce: Nonce; expiresAt: number; label: string; selfSignature: Signature };

export interface GrantRequest {
  version: typeof PROTOCOL_VERSION;
  grantee: GranteeKey;
  scope: RequestedScope;
  binding: Binding;
}

export interface GrantResponse {
  grantId: GrantId;
  scopeSalt: Salt;
  approvedScope: ApprovedScope;
  view?: ViewingKeyRef; // only with read access
}
```

`connect` and `mn-passport-agent` build a `GrantRequest`, and `core` validates
it on the authorizer page. Neither side imports the other. The wire axis
(`PROTOCOL_VERSION`) is separate from the binding axis.
[`sdk-requirements.md`](./sdk-requirements.md) rule 5 owns both.

### Example 8: Passport in the wallet picker of a different chain (after V1)

```ts
import { registerPassportWallet } from '@midnight-ntwrk/mn-passport-ecosystems/solana';
import { announcePassportProvider } from '@midnight-ntwrk/mn-passport-ecosystems/evm';

registerPassportWallet({ passportAppUrl }); // Solana Wallet Standard
announcePassportProvider({ passportAppUrl }); // EIP-6963, with an EIP-1193 provider
```

A dApp on Solana or on an EVM chain calls one function when it starts. Then
Passport shows in its wallet picker, next to the other wallets. The package
holds no key and no ACC logic. It sends each request to the Passport app in a
popup:

1. `core` shows the request, and the user approves it with a passkey tap.
2. The ACC authorizes the intent.
3. `adapter-multi-chain` gets the signature for the other chain and reports the
   settlement.

A dApp on a different chain cannot hold a grant on the ACC. Thus, the Passport
app approves each request. This is the only flow in which the Passport app acts
for a dApp on each request. A Midnight dApp always uses a grant (example 3).

## Sources

- SDK realignment proposal:
  [`2026-09-25-sdk-realignment.md`](./proposals/2026-09-25-sdk-realignment.md),
  §4 to §9 and §13.
- SDK deliverables:
  [`2026-09-25-sdk-deliverables.md`](./proposals/2026-09-25-sdk-deliverables.md),
  D1 to D5.
- Package map:
  [`2026-09-25-sdk-packages.svg`](./proposals/assets/2026-09-25-sdk-packages.svg).
- ADR [0002](./adr/0002-m0-per-seam-specs-with-dev-defaults.md) (per-seam
  specs) and ADR [0004](./adr/0004-artefact-hashes-committed-compiler-deterministic.md)
  (artifact hashes).
- Planning workspace (`midnightntwrk/passport`): the scoped-grants MIP (§9,
  §10), the signature-schemes MIP (§2), `contract/GRANTS-CALLER.md`,
  `contract/WEBAUTHN.md`, and PRs #170, #175, #176, and #180.
- Planning workspace: the cross-chain integration interface (component C25).
- Account recovery: MIP-0022 (Proposed, upstream #339, amended by #385), the
  reference circuits in `contract/contracts/account.compact`, components C14
  and C15, and ADR [0006](./adr/0006-guardian-recovery-scheme-in-kernel.md).
- Wallet standards of other chains: the Solana Wallet Standard, EIP-6963, and
  EIP-1193.
- midnight-js `PrivateStateProvider` and `submitCallTx`, checked at
  `v5.0.0-beta.7`.
