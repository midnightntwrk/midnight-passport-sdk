# Midnight Passport SDK requirements

> **Status:** draft · 2026/10/19
> **Owns:** what the SDK must do, and the normative rules (the MUSTs) that the
> `conformance` lens checks.
> **Companions:** [`architecture.md`](./architecture.md) (packages, seams, and
> adapters), [`provider-integration.md`](./provider-integration.md) (the WaaS
> provider, the prover, and the sponsor), and
> [`roadmap.md`](./roadmap/roadmap.md) (what beta contains).

## Summary

- The **Account Custody Contract (ACC)** is the account of the user. It holds
  the funds and enforces the rules. Each key on it is a **device** (full
  authority) or a **grant** (scoped authority).
- The holder of a key makes the key, and Passport registers it. One
  **key-provider** interface serves each type of key.
- **The Passport app** creates accounts, registers devices, issues and revokes
  grants, keeps private data, and does recovery. Only it has full authority.
- **A dApp or an agent** gets a grant through the grant ceremony. Then it
  builds, signs, proves, and submits its own calls, with Passport closed.
- **A passkey tap** occurs when Passport issues a grant and when the handoff
  completes. There is no tap for each call.
- **Transaction in, proof out.** The prover holds the proving keys. In V1, it
  sees the private inputs of each proof, for example the coin and the amount.
  The user is told.
- **A user never holds or pays with DUST.** A sponsor pays the fees, or the user
  swaps for them through the Capacity Exchange.
- **A payment to an account is a deposit**, never a transfer to a raw address.

## The ACC: devices and grants

The ACC is the durable identity of the user. Keys come and go, but the ACC
stays. One ACC holds the device set, the grants, the name binding (for example
`alice.passport.night`), the encryption key (`enc_key`), and the assets.

**A device** has full authority. It can add and remove devices, issue and
revoke grants, and spend. Only a device can issue a grant.

**A grant** has scoped authority, with these limits:

| Limit | Meaning |
|---|---|
| Operations | The operations that the grant permits |
| Token color | One token color |
| Caps | A cap for each call, and a total cap |
| Coin bound | A bound on the coins that a call can use |
| Recipient pin | An optional fixed recipient |
| Caller pin | An optional contract that calls the ACC directly (`kernel.caller()`) |
| Expiry | The time after which the grant stops |

The ACC checks each limit on each call, and a client cannot bypass it. A caller
pin checks only the immediate calling contract, not a browser origin or a fee
payer. A read-only grant cannot carry a caller pin.

**Revocation.** A device revokes one grant (`revoke_grant_with_*`) or all
grants (`revoke_all_grants_with_*`). The removal of a device cannot remove a key
that added a spare entry for itself (errata 7 and 8). Thus, the SDK must
register a key as a device only if it is a device of the user. Each other
platform, dApp, or agent gets a grant.

## Keys

### Key providers

A key provider holds a private key and signs an ACC challenge. The Passport app
registers the key on one of two paths:

| Path | Circuits | Authority | Where |
|---|---|---|---|
| Device | `activate_initial_device_with_*`, `add_device_with_*` | Full | The Passport app only: the passkey at account creation, then an optional WaaS backup key |
| Grant | `issue_grant_with_*` | Scoped | The Passport app, through the grant ceremony |

The SDK must supply these key providers:

| Key provider | Scheme | Usual registration |
|---|---|---|
| Passkey | JubJub, from the PRF output of the passkey | Device |
| Passkey on secp256r1 | p256, `wa-json134` WebAuthn profile only | Device or grant |
| Embedded wallet of a WaaS provider | k256, envelope 0 | Device: an optional backup owner key |
| Midnight connector wallet | k256, envelope 1 (`signData` with `ecdsa_secp256k1_sha256`) | Device, or a read-only grant |
| dApp per-origin key | JubJub, k256 (envelope 0), or p256 | Grant |
| Agent key in OWS | JubJub or k256 (envelope 0) | Grant |

[`architecture.md`](./architecture.md) owns the interface and the package of
each key provider (section "Key providers"). These rules apply:

- **One p256 profile.** The `clientDataJSON` is exactly 134 bytes in a fixed
  field order, with a 21-byte origin.
- **The WaaS key enrolls from a signature**: the provider has no call to read
  the public key. The SDK enrolls it from a signature over a known digest.
- **One envelope for each k256 key.** The envelope does not change after
  enrollment.
- **Envelope 1 keys can only read as grants.** The scoped-grants MIP refuses
  them on the spend seam.
- **One grantee key for each account and each origin.**

### Signing digests

The ACC verifies these exact digests. `H` is SHA-256, `||` joins bytes, and `c`
is the 32-byte challenge of the circuit:

| Arm | Digest that the key signs |
|---|---|
| k256, envelope 0 | `H(c)` |
| k256, envelope 1 | `H(ASCII("midnight_signed_message:32:") \|\| c)`. The prefix is exactly 27 bytes. |
| p256 | `H(authenticatorData \|\| H(exact clientDataJSON))`. The client data carries `c` as 43 unpadded base64url characters. |
| JubJub | A Schnorr signature over the challenge, with the grinding rule of the ACC |

The k256 arm never verifies the raw challenge directly. The SDK must build each
challenge from the arguments of the circuit.

### Adding a key

A new key comes to the account through a signed request out of band, as a QR
code or a link. It carries a scheme tag, a public key, a commitment, an account
hint, a nonce, an expiry, and a label. A self-signature covers all of them.

The Passport app verifies the request before it shows any ceremony. The user
then approves with a current device. A device request ends in
`add_device_with_*`. A grant request also carries a requested scope, and it
ends in `issue_grant_with_*`. Only the Passport app signs the approval.

## Ceremonies

**The ceremony gate.** The SDK must get a passkey tap when Passport issues a
grant, and when the handoff of private data completes. Both occur in the
connection flow. After that, there is no tap and no Passport ceremony for each
call. The exception is a grant key that is itself a passkey on the origin of
the dApp.

Each passkey signature in the Passport app also needs a tap, so no process can
make a device signature without the user. On the JubJub arm, the kernel of
`core` derives the device key and the WPP account key from the PRF output, for
one operation only. On the p256 arm, the key stays in the authenticator.
[`architecture.md`](./architecture.md) owns the kernel invariant.

**Recovery taps.** Recovery operations are not calls, so each one gets its own
tap: a recovery session, each share that a guardian gives, a cancel, and the
display of a paper key (section "Recovery").

**A device without PRF.** The JubJub arm and the WPP keys need the PRF
extension. The p256 arm gives a device without PRF, but WPP still needs a
secret. Open question 1 asks if a password fallback stays.

## Proving and fees

### Transaction in, proof out

The prover seam takes an unproven transaction and returns the proven
transaction: `prove(unprovenTx, circuitIds) → provenTx`. These rules apply:

- **The prover holds the proving keys**, or it makes them again, byte for byte,
  from the ZKIR and the on-chain verifier key. A client never uploads them.
- **A client loads about 1 MB for each contract:** the compiled module, the
  ledger decoder, and the manifest. Only a client that verifies circuits loads
  the ZKIR and the SRS.
- **The keys change with the exact zkir and midnight-zk crate revisions.** The
  version registry records these revisions.

**What the V1 prover sees.** The prover gets the unproven transaction. Thus, it
sees the private inputs supplied for proving, for example the coin and the
amount. The same prover proves the circuits of dApps, and their witnesses can
hold other sensitive data. The SDK must tell the user this, for the ACC and for
each dApp circuit. Encryption of the proving input to an enclave becomes
mandatory when a trusted-hardware prover exists. The SDK does not do remote
attestation.

**No proofs in the tab in V1.** The ACC circuits are at k=15 to 17, with
proving keys of 112 to 224 MB. The zkir WASM package has no key generation.

### Fees and broadcast

- **No user-held DUST.** No SDK path can assume that the user holds DUST.
- **Broadcast.** The client gives the proven transaction to the sponsor, which
  pays the fees and broadcasts it. The client monitors it until it is final.
- **Bounded waits.** The broadcast client uses bounded waits, and submits again
  when a transaction does not arrive.
- **Onboarding.** A sponsor pays the fees of account creation and the opening
  balance.

**The Capacity Exchange** is the other fee route. Liquidity providers sell DUST
capacity for a token that the user holds. The SDK gets quotes off chain, and
the user selects one. The provider returns a partial transaction, and the SDK
adds the intent of the user. NIGHT that a contract holds cannot make DUST, so
this route matters for ACC funds.

The fee adapter must handle quote expiry, replay, and abandoned quotes. It must
ask only trusted providers, because a quote request shows the amount class and
the payment token.

The fee seam is shared, because dApp and agent calls also pay fees.

## Services

Each service is replaceable behind a seam.

| Process | Service | What it can see or do |
|---|---|---|
| Proving | The prover | The private inputs of each proof, for example the coin and the amount |
| Fees and broadcast | The sponsor | The proven transaction |
| Fee swaps | The Capacity Exchange | The amount class and the payment token of a quote |
| Backup owner key (optional) | The WaaS provider | It holds a full-authority key, isolated to the Passport app. It reads the public account metadata. |
| Private-data storage | WPP storage | Ciphertext only |
| Chain reads | The indexer | What the viewing key opens, if the client gives it |
| Total-loss recovery | Guardians | Their own shares only |

If the user enables the backup owner key, the WaaS provider needs the most
trust.
[`provider-integration.md`](./provider-integration.md) owns the contract with
the WaaS provider and the prover.

## Onboarding

Onboarding occurs only in the Passport app. The user starts there, or comes
from a dApp. The SDK deploys the ACC, activates the first owner key, and claims
the name. Only the Passport app adds an owner key.

**Waves.** The deploy planner packs the circuits into waves within a
15,000-byte verifier budget. It uses the actual artifacts, so the wave count is
not fixed. On 2026/10/09, the account with caller pins took seven waves. The
account with the p256 arm took ten waves. The contract binding must accept a
partly deployed account, and a client checks only the circuits that it calls.

### In the Passport app

1. The user makes a passkey on the device. It becomes the first owner key.
2. The app deploys the ACC in waves, and the sponsor pays.
3. The app claims a free, first-come, first-served name under `passport.night`.
4. The app creates the DID of the account.
5. The user can opt in to a backup owner key: the embedded wallet of a WaaS
   provider (below).

**Recognition.** `core` recognizes an account from the passkey and its
largeBlob. The largeBlob is a cache, never the source of truth: a hit is checked
against the chain. The RP ID, the PRF salt, and the largeBlob schema come from
`mn-passport-protocol`.

### From a dApp

A dApp never onboards a user, and it never drives an owner key. The dApp sends
its usual grant request. The authorizer page finds no account, so the Passport
app onboards the user first, as above. Then, in the same visit, it issues the
grant to the per-origin key of the dApp. The redirect takes the user back to
the dApp.

A dApp must never create a Passport with a device secret in its own code.

### The WaaS backup owner key

The user can add the embedded wallet of a WaaS provider as a backup owner key.
It has the same authority as the passkey, and it works alone. Thus, it adds
trust in the provider. A dApp can reach the same key through the same provider.
Thus, the backup role alone does not stop an owner operation from a dApp.

The WaaS provider must do these things:

- sign raw ACC challenges with the key of the user;
- **isolate the key to the Passport app:** a key or session that no other
  origin can use, or a signing policy that refuses each ACC owner operation
  from another origin;
- keep metadata on that key, readable from each origin that it serves;
- let only the Passport app write or delete the entries of Passport;
- let the Passport app sign in as the user.

These rules apply:

- **No isolation, no enrollment.** Without isolation and protected writes, the
  Passport app does not enroll the key.
- **Two parts of metadata.** Public account metadata, such as the ACC address,
  finds the account. The viewing key and the WPP account key are never in
  readable form there. The provider keeps them in a part that only the Passport
  app can read. Or, the app encrypts them under a key that no other origin of
  the provider can get.
- **Small, versioned metadata.** Each entry has a namespace and a version. Each
  write reads, merges, writes, and reads back. Some providers keep only 2 KB.
- **Bound and fresh metadata.** Encryption does not stop a replacement or a
  replay. Thus, Passport authenticates each entry, bound to the ACC address and
  to the version of each key. At recovery, it rejects an entry for another
  account or with an older key.
- **A current backup.** After a rotation of the viewing key or of the WPP
  account key, Passport writes the new keys to the metadata. If the write
  fails, Passport marks the backup as stale and tells the user.
- **The user is told** that the provider holds a full-authority key. Thus, the
  account is only as safe as the signing security of the provider.

The `adapter-waas` spec has four acceptance checks:

1. After enrollment, a dApp session with the same provider cannot get a
   signature for an owner operation, for example `add_device`.
2. A dApp without read consent cannot recover the viewing key or the WPP
   account key from the metadata.
3. A recovery with the backup key restores signing, the viewing key, and the
   private state (section "Recovery"). It runs on a fresh device, without the
   original passkey or a local cache, and again after each key rotation.
4. Another origin of the provider cannot write or delete the entries of
   Passport. Recovery rejects a replaced or a replayed entry.

## dApps

### Connection

A dApp connects through the grant ceremony of the scoped-grants MIP (§9), with
the browser profile:

1. `mn-passport-connect` makes a key for the origin of the dApp.
2. It sends the user to the Passport authorizer page with a `GrantRequest` and
   a possession proof. Both bind the web origin of the dApp.
3. If the user has no account, the Passport app onboards the user first
   (section "Onboarding").
4. The user approves the grant with a passkey tap, and Passport submits
   `issue_grant`.
5. The user gives separate consents for private-state access and, with read
   access only, for the viewing key.
6. Passport completes the handoff and redirects back to the dApp.
7. The dApp reads the grant from the chain. It verifies the scope and the key
   binding before it trusts the grant.

Passport has no request and response channel through which it acts for a
Midnight dApp. Realignment §8.2 and §8.5 give the full flow. Deliverable D13
gives its acceptance test.

### Calls

The dApp builds the circuit that composes the ACC of the user. The SDK supplies
the interface of the ACC, the challenge, and the grant signature. The SDK does
not compose the call.

A called contract cannot run a witness. Each shielded spend of the ACC uses the
witness `held_coin`. Thus:

| A dApp circuit can call it | It must start its own intent |
|---|---|
| Deposits, unshielded withdrawals, device and grant management, `append_inbox_with_*` | `withdraw_shielded_*`, `withdraw_shielded_to_contract_*`, and their grant forms |

A shielded spend from the ACC thus needs two intents in one transaction. The
**transaction joiner** in `mn-passport-account` joins them with `addIntent`,
never `merge`.

### Independent operation

After the grant and the handoff, the dApp operates with the Passport app
closed. It signs with its own grant key, never through Passport. It tracks
confirmation and keeps its own state, also after a reload or a retry. A revoked,
expired, or exhausted grant stops the authorization. To change a grant, the dApp
goes back to Passport. An operation must not need a live Passport tab, an
iframe, or an owner ceremony.

`connect` also supplies Pay with Passport, a sign-in button, and a starter
project as an AI-agent skill. A user without a Passport goes to the Passport app
and back.

**`connect` never links `core`.** A dApp must not pull in the kernel of the
Passport app. Shared code goes into `mn-passport-account`.

## Agents

An agent uses the same grant message as a dApp, with the **agent profile**. The
library is `mn-passport-agent`, for Node.js. It never links `core`.

1. The agent backend makes its key in OWS.
2. The library builds a grant request with no web origin. It binds the agent key
   with a self-signature, a nonce, an expiry, and a label.
3. The agent provider shows the request as a QR code or as a link. The user
   approves a scope in the Passport app, which shows the agent profile.
4. The agent gets the readable scope and its salt, because the chain stores most
   limits as salted commitments.

**On-chain grant status.** Before OWS signs, the library reads the grant from
the ACC: its status and the commitments that the readable scope opens. OWS then
enforces the grant as its policy. This is a read of the chain, not a check on a
server.

**Execution.** The library gets the artifacts of a dApp from a registry, by
content hash. It makes the verifier key again from the ZKIR and compares it
with the key on chain. Then it runs the circuit. OWS signs, the prover proves,
and the sponsor broadcasts, with the Passport app closed. In V1, the agent
verifies the client code against a hash that the dApp publishes.

## Private data

The witness functions of a dApp read its private state from a midnight-js
`PrivateStateProvider`. After the handoff, the dApp reads and writes that state
without Passport, and its witness code does not change.

- **WPP.** Passport keeps the private data and makes backups through the
  Witness Protection Program (WPP). No plaintext crosses the storage seam.
- **Three consents.** The grant, private-state access, and the viewing key are
  three separate consents. The viewing key comes only with read access.
- **The handoff.** After the passkey tap, `core` makes a key for the WPP package
  of the dApp, and only for that package. The dApp never sees other packages,
  the full profile, or a bulk export.
- **Write-back.** The dApp writes new state only after the transaction finalizes
  with `SucceedEntirely`, on each submit path. If the write fails, the dApp
  keeps the state locally as not yet saved and tries again.
- **Private-state revocation.** A revocation does not take back data that the
  dApp already read. Thus, Passport rotates the key of that package and tells
  the user.
- **The read-access lifecycle (scoped-grants MIP §8).** A revocation does not
  take back the viewing key. Thus, Passport has three duties:
  - **Rotate before share.** Before it issues a read grant, Passport rotates the
    encryption key (`rotate_enc_key_with_*`) and re-encrypts the live holdings.
    The new holder cannot read spent history.
  - **Re-seal after each rotation.** A rotation blinds each other holder of a
    read grant. Passport re-seals the new key to them, or it marks them as
    needing reconnection and tells the user.
  - **Revoke.** After a revocation, Passport rotates, re-encrypts the live
    holdings, and re-seals to the remaining holders. Notes sealed before the
    rotation stay readable to the revoked party. The consent screen says this.
  The spec of the read-grant lifecycle owns partial completion and cost.

| Data | Tier | Where |
|---|---|---|
| The private state of a dApp | Irreplaceable | WPP |
| The coin store of the ACC | Passport can make it again with the viewing key | Local cache only |
| Viewing key, ACC address, grant references | Small, rarely changed | WPP metadata, the passkey largeBlob, or the WaaS metadata (keys never in readable form) |
| Device keys | Passport can make them again from the passkey | Not stored |

WPP storage uses a folder that the user can see (the `drive.file` scope). A
hidden `appDataFolder` is only a cache. When two histories conflict, WPP keeps
each one. The SDK reports when the freshness of a backup is unknown.
Realignment §8.5 gives the storage design.

## Recovery

Recovery has two parts: control of the account, and the private state.

| Case | How the user recovers control |
|---|---|
| A lost device | A current device removes it. The limits of errata 7 and 8 apply. |
| Total loss | Guardians or paper keys recover a secret, and the ACC enrolls a new device |
| A lost passkey, with the WaaS backup key | The user signs in to the Passport app with the provider. The backup key approves a new passkey. The app restores the viewing key and the WPP account key from the metadata. |

**Total loss.** MIP-0022 owns the protocol. Guardians keep no state for each
account: each guardian computes its share again on request, from a secret that
it already holds. A guardian is a passkey (profile A), a cold signer with
deterministic signatures (profile B), or a paper key (profile C). One roster
can mix them. The ACC stores the public shares, a commitment that gates the
recovery, a wrap of the viewing key, and a session id. Nothing on chain names
a guardian.

Recovery has two phases. `recover_submit` records a pending recovery. After a
veto window of some days, `recover_finalise` retires every old device and
enrolls the new one. During the window, any enrolled device can cancel. In
total loss no device remains, so the window is a delay and an alarm. Then the
guardian quorum is the root of trust.

**What the SDK must enforce.** The contract cannot check freshness or the
roster, so these are obligations of the client (rules 15 to 18):

- Each session uses a fresh recovery secret and a fresh session id, and every
  guardian of the new roster answers. A reused session id can give the secret
  to anyone who reads the chain.
- The recovery secret is never at rest. It exists only while a session or a
  recovery runs, in the kernel, and it never reaches a screen, a log, or an
  adapter. The prover sees signatures only, never the secret.
- The SDK checks the reconstructed secret against the commitment before it
  submits.
- A passkey guardian's secret is the same for each session. Thus, one
  compromised Passport build could take the shares of many passkey guardians
  at once. A roster where passkey guardians alone reach the threshold is
  refused by default.
- After `recover_finalise`, the account has no recovery backup. The SDK warns
  the user until a new session completes.

[`architecture.md`](./architecture.md) (section "Recovery") gives the design and
the security model.

**Private state.** The recovery secret also decrypts the viewing key, which the
ACC stores in encrypted form. With it, Passport makes the coin store again. WPP
key recovery restores the private data of dApps, and it does not replace account
recovery. The account-recovery MIP owns the protocol, and `adapter-recovery`
implements it behind `core`.

## Identity (DID)

A `did:midnight` identifier is its own contract, with one deployment for each
DID. A JubJub Schnorr key controls it, and a separate key recovers it. Each
update reads a timestamp witness, so the DID can only start a transaction. Thus,
the ACC cannot be its controller today.

**In V1, the Passport app operates the DID** through `adapter-did`, behind
`core`. It creates the DID with the account. It links them: `alsoKnownAs`
carries the Passport name, and a service entry names the ACC. It holds the
controller and recovery keys (open question 4), signs each update, and resolves
from the indexer.

**One signing primitive.** The DID key uses JubJub Schnorr, as the JubJub arm of
the ACC does. The SDK must not add a different signature scheme for DIDs (open
question 5).

**The target: a DID that the ACC controls.** The DID contract stores the ACC
address as its controller. Each update calls the ACC, which checks for a grant
to act on that DID. This needs three changes:

| Where | Change | Owner |
|---|---|---|
| DID contract | A controller mode for account contracts, on ledger 9 | The DID team |
| ACC | An exported authorization circuit with no witness | Passport (contract) |
| Scoped-grants MIP | A grant operation to act on a different contract | Passport (standards) |

`midnight-did` pins ledger 8, but the ACC is on ledger 9. This gap stays open
until `midnight-did` moves to ledger 9.

## Payments

**Deposit, not address.** A Passport account is not payable by a plain transfer
to an address. A payment to an account is a deposit call. Deposits are
permissionless: no grant, no ceremony, and no action from the recipient.

| Recipient | Circuit | What the payer must supply |
|---|---|---|
| A shielded wallet | `withdraw_shielded_*` | The full shielded address |
| Another Passport, from a Passport | `withdraw_shielded_to_contract_*`, joined with `deposit_shielded` | A 192-byte inbox entry, sealed to the `enc_key` of the recipient |
| A Passport, from a different wallet | `deposit_unshielded` or `deposit_shielded` | The ACC address, from the name service |
| An unshielded address | `withdraw_unshielded_*` | An `mn_addr` address |

These rules apply:

- **A full shielded address.** midnight-js needs the encryption public key to
  build the note. Both halves come from one parsed address.
- **The recipient key at the time of the seal.** A payment reads the `enc_key`
  of the recipient when it seals, and again for each retry.
- **The change coin.** Before a spend, the coin store reads the position of the
  change coin from the indexer.
- **No raw ACC address.** Assets sent outside the deposit circuit are not in the
  bookkeeping of the ACC. A user interface must show the Passport name.
- **Disclosure.** A payment between two Passports links the two accounts in
  public. No circuit moves NIGHT between two accounts.

Wallets that only do address-to-address transfers cannot pay a Passport. Thus,
the deposit is an ecosystem requirement. `connect` exposes it as Pay with
Passport, without `core`.

## External wallets

An external wallet can sign for the ACC only on an arm that the ACC verifies.

| Wallet type | Status |
|---|---|
| Midnight connector wallet with `ecdsa_secp256k1_sha256` | Supported: k256 envelope 1, as a device or a read-only grant |
| Midnight connector wallet with a different scheme | Not supported |
| Ethereum-style wallet (EIP-191) | Not supported: it cannot sign a raw digest |
| Solana wallet (Ed25519) | Not supported: the ACC has no Ed25519 arm |

An Ethereum-style wallet needs a new k256 envelope with keccak-256 in the
circuit, or a provider wallet that signs a raw digest (open question 6).

**After V1.** [`architecture.md`](./architecture.md) shows three directions for
other chains: `adapter-multi-chain`, `mn-passport-ecosystems`, and EVM and
Solana wallets as signers on new ACC arms. A dApp on a different chain cannot
hold a grant. Thus, the Passport app approves each of its requests with a
passkey tap. Only in this flow does Passport act for each request.

## Reference implementations

These are expectations on the SDK, not SDK deliverables:

1. **The Passport app** of the Midnight Foundation, built on `core`.
2. **A reference Midnight dApp.** It holds a grant and passes the acceptance
   test of deliverable D13. It sends a new user to the Passport app to
   onboard.

## Normative rules

The `conformance` lens checks these rules. The sections above give the detail.

| # | Rule |
|---|---|
| 1 | **Ceremony gate:** a passkey tap at grant issuance and at the handoff. No tap for each call, except for a passkey grant key on the dApp origin. |
| 2 | **Prover disclosure:** the V1 prover sees the private inputs of each proof, for the ACC and for each dApp circuit, and the user is told. Enclave encryption is mandatory once a trusted-hardware prover exists. |
| 3 | **Deposit, not address:** a payment to an account is a deposit call, with an inbox entry for a payment from a Passport. |
| 4 | **`connect` and `mn-passport-agent` never link `core`.** Shared code goes into `mn-passport-account`. |
| 5 | **Two version axes:** the wire axis (the MIP §9 messages) and the binding axis (`mn-passport-contract` and the deployed ACC). |
| 6 | **A full shielded address**, with both halves from one parsed address. |
| 7 | **The recipient key at the time of the seal**, and again for each retry. |
| 8 | **Write-back after `SucceedEntirely`**, on each submit path. After a failed write, the dApp keeps the state locally and tries again. |
| 9 | **Independent operation:** after the grant and the handoff, a dApp or an agent signs with its own grant key, with Passport closed. |
| 10 | **One grantee key** for each account and each origin. |
| 11 | **No onboarding in a dApp:** a dApp never onboards a user, and it never drives an owner key. Only the Passport app adds an owner key. |
| 12 | **The WaaS key only as an isolated backup owner key:** Passport enrolls it only when the provider isolates it. The metadata never holds the viewing key or the WPP account key in readable form. Only Passport writes it, bound to the account and the key versions, and refreshed after each rotation. The user is told. |
| 13 | **The read-access lifecycle:** rotate before share, re-seal or mark for reconnection after each rotation, and rotate on revocation. The package key rotates after private-state revocation. The user is told. |
| 14 | **No user-held DUST** on any SDK path. |
| 15 | **A fresh recovery session:** a fresh recovery secret and a fresh session id for each session, and a share from every guardian of the new roster. The secret is never at rest, never leaves the kernel, and is checked against the commitment before a submit. The SDK rejects an artifact set with a version that it does not implement. |
| 16 | **Roster diversity:** passkey guardians alone never reach the threshold, unless the user overrides with a tap. The override is recorded with the roster. The SDK warns when guardian credentials share a person, a provider, or a place. |
| 17 | **A guarded share:** a guardian gives a share only after a tap and a confirmation of the account, and only to an authenticated owner, sealed to that owner. The guardian secret is derived only for that share, and never cached. |
| 18 | **Recovery alarms:** each enrolled device watches for a pending recovery and alerts the user. After repeated submissions, the SDK proposes a new session. After finalization, it warns until a new session completes. The roster record names the SDK version that ran the session, and a session from a revoked version forces a new one. |

## Open questions

1. **Password fallback (decision D).** On a device without PRF, does the
   ceremony use a password with a key-derivation function? This is open.
2. **The activation guard.** _Closed 2026/10/19._ A dApp never onboards a user,
   so no dApp drives an owner key (realignment open question 15).
3. **Agents and private data.** Can an agent backend get the private data of a
   dApp (realignment open question 3)?
4. **DID keys in V1.** Is the DID controller key derived from the PRF output, or
   kept in WPP? Where does its recovery key go (realignment open question 12)?
5. **One signing primitive.** Is a separate JubJub DID key acceptable until the
   ACC controls the DID (realignment open questions 12 and 14)?
6. **Ethereum-style wallets.** A new EIP-191 envelope, or a provider wallet
   (realignment open question 13)?
7. **Sign-in.** Is sign-in a grant with read scope, or does it wait for a
   sign-in MIP (realignment open question 1)?
8. **The viewing key.** How does it get to OWS and to dApps with read grants
   (realignment open question 4)?
9. **The WaaS key scheme.** k256 envelope 0, or p256 within `wa-json134`
   (realignment open question 11)?
10. **The recipient encryption key.** Must the signed challenge cover it
    (realignment open question 9)?
11. **Contract signing keys.** Does Passport or the dApp keep the per-contract
    signing key (realignment open question 10)?
12. **The registry.** Where do dApps publish their artifacts (realignment open
    question 5)?
13. **The roster record.** The record of guardians, indexes, and the threshold
    is not secret, and it must survive total loss. It cannot live only in WPP,
    because the WPP keys are lost too. Is it printed with the paper keys, kept
    in the WaaS metadata, or exported as a file?

## Sources

- Realignment proposal:
  [`2026-09-25-sdk-realignment.md`](./proposals/2026-09-25-sdk-realignment.md),
  §2 to §9, §12, and §13.
- Deliverables:
  [`2026-09-25-sdk-deliverables.md`](./proposals/2026-09-25-sdk-deliverables.md),
  §4 and §6.
- Planning workspace (`midnightntwrk/passport`): the scoped-grants MIP (§3.2,
  §9, §10), the signature-schemes MIP (§2), the account-recovery MIP
  (MIP-0022, Proposed, upstream #339 and #385), components C14 and C15,
  `contract/contracts/account.compact` (`spec_version = 3`),
  `contract/README.md` (waves), `contract/GRANTS-CALLER.md`, and
  `contract/WEBAUTHN.md`; PRs #170, #175, #176, and #180.
- `did:midnight`: <https://github.com/midnightntwrk/midnight-did>.
- midnight-js `PrivateStateProvider` and `submitCallTx`, at `v5.0.0-beta.7`.
- Capacity Exchange: the upstream sponsor design (pre-launch).
