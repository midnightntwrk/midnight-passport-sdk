# 0012 — The remote prover sends no proving key

Date: 2026/11/18 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#87 · `provider-integration.md`,
section "The prover"

## Context

- The stock midnight-js 5.0.1 client sends the proving key and the ZKIR of
  each contract call to the proof server. The stock proof server 9.0.2 finds
  only the built-in keys by itself.
- A p256 circuit of the account has a proving key of about 470 MB. The
  fifteen passkey-signed circuits have keys of 470 to 495 MB. In a lab run
  (2026/11/09), the stock client loaded 469,854,852 bytes into the tab for one
  key, and the process peaked at 1.17 GB.
- In the same run, a proxy in front of a stock proof server held the keys.
  The client posted only the preimage and the key location. One activation
  and two p256 owner calls uploaded 5.8 KB in total. A p256 owner-call proof
  took about 23 s.
- The proof-generation canvas of the planning workspace picks in-tab WASM
  proving, and keeps a hosted provider as a fallback. The SDK docs put no
  proof in the tab in V1. A tab cannot hold a 470 MB key.
- No doc fixed the request format, the credential, or the status codes of the
  proving service.

## Decision

1. **The wire.** `POST <url>/check?key=<location>` and
   `POST <url>/prove?key=<location>&binding=<decimal>`. The body is the
   serialized preimage. `key` is percent-encoded, and `binding` is left out
   when the call has no binding input. A built-in proof comes to `/prove`
   with a `midnight/…` location. The ledger proves the calls of one
   transaction at the same time, so the requests can come at once. The
   service finds the prover key and the ZKIR by the `vk` hash in the key
   location, and builds the stock body itself.
2. **Verifier keys.** The client gives the ledger the verifier key from the
   contract artifacts. It checks the SHA-256 of the key against the location
   before any request.
3. **The credential.** The app gives a short-lived token for each user or
   dApp origin, through a callback. It goes in `Authorization: Bearer`. The
   SDK holds no shared secret.
4. **Client rules.** The key-location label is the transaction author's
   choice, so the adapter reads the contract calls of the transaction. It
   refuses the whole transaction before any request if a call's entry point
   is not declared, and each label must name one of those calls. Only the
   three built-in labels of ledger 9 pass. Built-in zswap and dust preimages
   are sent to the service, and they hold the user's coin data. The declared
   names carry no address, so a declared name also admits that name on
   another contract. The adapter also refuses a URL that is not `https:` or
   loopback `http:`. An unknown status is final.
5. **The status map.** 400, 404, 413, and 422 are final rejections. 401 and
   403 are final. The adapter retries 429, 500, 502, 503, and 504 until one
   deadline for the call. It retries a network failure, which a redirect also
   gives, at most twice.
6. **V1 uses the hosted fallback for p256 calls.** The user is told that the
   prover sees the private inputs (rule 2). The user then approves the grant
   with a passkey tap (rule 1). So the user opts in, and the routing is not
   silent. The first proof is the account activation, which comes before any
   grant, so the grant tap cannot gate it. The consent hook is the first-proof
   gate, once for each account and text version. The grant tap stays the
   opt-in for each dApp.

Rejected options:

- **The stock body with no key material.** A stock 9.0.2 server rejects a
  contract call with it. A server with the configured-artifact change
  (midnight-ledger PR 770, not merged) reads it.
- **The stock client.** It uploads the proving key on each call.

## Consequences

- The service must read decision 1 and must not log the query, because it
  names the contract and the circuit.
- The self-host path is a stock proof server behind a key-holding proxy. The
  adapter's tests hold such a proxy as a harness. It is not hardened for
  self-hosting.
- When PR 770 lands, the service can become a thin proxy for the credential,
  the queue, and decision 1.
