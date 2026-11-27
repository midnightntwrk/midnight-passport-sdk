# 0014 — Account secrets and deploy inputs

Date: 2026/11/23 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#74 ·
midnightntwrk/midnight-passport-sdk#139 · requirements, "Keys" ·
architecture, "The owner kernel invariant" · kernel boundary

## Context

- The passkey is the first owner key, on the p256 arm. It signs inside the
  authenticator, so no secret comes from it. Before 2026/11/12, one PRF
  output gave every input of a new account. Now each input needs a source.
- The constructor takes five inputs: the boot commitment, the encryption
  key, the birth recovery key, the birth recovery wrap, and the veto window
  (ACC `spec_version = 3`). The deploy also holds the maintenance authority
  and the wave-1 verifier keys. All of these fix the address.
- The ledger draws the deploy nonce at random, and no API sets it. So the
  address is known once the deploy is built, but the inputs alone do not
  give it.
- The maintenance authority is a committee of BIP-340 keys on secp256k1. It
  can replace any verifier key, so it has full control. A passkey signs
  P-256 ECDSA, so it cannot be the authority key itself.
- A lab run: an update signed by a BIP-340 key applied on a local node,
  and a key outside the committee was refused. One credential and one PRF
  input gave the same 32 bytes on three taps, at create and on a
  discoverable sign-in.
- The product owner decided: a beta account needs the viewing key of its coins, and
  must survive a wipe. The user never keeps a password, a paper key, or a
  recovery code.

## Decision

One source for each input. The tags are in the domain-separation tag list.

1. **Maintenance authority.** A random BIP-340 key, new for each account.
   The committee is that key alone, at threshold 1. At rest the key exists
   only as an AES-256-GCM wrap, under a key from the authority PRF input,
   next to the viewing-key wrap. Provisional (see "Open questions").
   - The deploy holds the public key, so the key and its wrap come before
     the deploy. A platform with no PRF result at create costs one more tap.
   - The read requires user verification. A passkey with no PRF result
     stops with a typed error. The fallback is open.
   - The wrap binds the public key. Before it signs, the kernel checks the
     opened key against the on-chain committee.
   - The kernel holds the key from its creation until the last update of
     the birth lands, or until `dispose`. A resume after a reload, or a
     later update, opens the wrap with one tap.
2. **Viewing key.** A random X25519 secret. At rest it exists only as an
   AES-256-GCM wrap, under a key from a second PRF input. A birth asks for
   both PRF inputs in one ceremony. A session asks for the viewing input
   only, so the kernel holds the authority key only for a birth or an
   update. A key rotation makes a new wrap.
3. **Local store key.** HKDF from the viewing secret. The first store read
   of a session costs one tap. A key rotation re-encrypts the store.
4. **Deploy nonce.** The ledger's random nonce. The resume record keeps the
   serialized deploy from the moment the SDK shows the address. A resume
   sends the same bytes.
5. **Birth recovery.** The identity point and an all-zero wrap. The recover
   gate refuses that key, so the account has no birth recovery, and the SDK
   says so. MIP-0022 allows this.
6. **Boot salt.** 32 random bytes in the resume record, dropped after
   activation. Only the committed passkey key can activate, so the salt is
   not a secret, and the resume record still holds none.
7. **Veto window.** 259200 seconds, one constant for each network in
   `mn-passport-protocol`.

The address comes from the ledger, as `deploy.address` of the built
deploy. The SDK does not work it out from the inputs: a probe did not
reproduce a hash recipe over the deploy bytes. The deploy holds the initial
state and the nonce. The initial state holds the constructor state, the
wave-1 operations with their verifier keys, and the authority (the key of
item 1, threshold 1, counter 0). No network id goes in.

**What a user loses when the device is wiped.** Your funds stay on chain,
but the app can no longer find your account. The account address cannot be
worked out again, and the passkey does not hold it. The app also loses the
key that reads your private deposits, and the key that adds features to
your account. Your passkey still exists. Until account lookup and a backup
of those keys exist, a beta account is a test account: keep nothing in it
that you cannot lose.

Rejected options:

- **Keep the authority key in clear in browser storage.** Any script on the
  Passport origin reads it, with no tap.
- **Derive the authority key from the PRF output.** Only the passkey is
  needed, so it survives a wipe. But two accounts from one credential then
  share the key, and the chain links them. The key is also the same on
  every network.
- **An operator or a committee holds the authority.** The operator gets
  full control. No rule allows that.
- **Derive the viewing key from the PRF output.** The bootstrap amendment
  (passport #212) says a PRF must not be needed for a constructor input.
- **A password, a paper key, or a printed birth secret.** The user keeps no
  secret.
- **Sign every planned update at birth, then drop the key.** No key is
  kept, and a local node run applied such an update. But nothing can be
  added that was not signed at birth, and the signatures hold for one
  contract build only. It stays as the fallback for a passkey with no PRF.
- **Patch the nonce into the serialized deploy.** It needs no upstream
  change, but it edits ledger bytes by hand.

## Consequences

- #139 decides how an account holds its maintenance key. Items 1 and 2
  depend on the PRF, so the docs describe a provisional PRF use until #139
  closes.
- A PRF leak is silent. Script on the Passport origin plus one tap gives the
  output in clear, and the same script reads the wrap from the record. The
  authority key then has full control. Device removal does not end it. Only
  a move or a retirement of the authority ends it.
- A deploy replayed on another network gets the same address and
  authority. Such a clone holds no funds.
- Each account has its own authority key, so the key does not link two
  accounts of one credential on chain.
- A new passkey with the same `user.id` replaces the PRF secret. A changed
  PRF value loses the authority and the viewing key, with no wipe.
- A beta account does not survive a wipe yet. A wipe loses both wraps, so
  the account also cannot gain circuits. The account lookup from a new
  device and a wipe-proof store for the two wraps close it.
- Under the temporary-JubJub bootstrap (passport #213), the passkey comes
  after the deploy. The deploy then needs another authority first, and an
  update after activation moves it to the account's own key.

## Open questions

1. The contract owner signs off the PRF-wrapped authority, against the rule
   "no secrets leave WebAuthn" (#139).
2. Where the two wraps live so that they survive a wipe: a new inbox suite
   on chain, or WPP. The contract owner signs off the PRF wraps.
3. The identity point as the default birth recovery key.
4. Whether the PRF removal reaches guardian passkeys (MIP-0022 profile A).
5. How the authority moves to the account's own key under the bootstrap.
6. The fallback for a passkey with no PRF: sign every planned update at
   birth, keep the signatures, and drop the key.
