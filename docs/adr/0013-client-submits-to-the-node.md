# 0013 — The client submits to the node, and the send loop is in `core`

Date: 2026/11/18 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#88 · provider integration, "Fees and
broadcast" · sponsor policy, "Client rules"

## Context

- The docs said that the sponsor pays and broadcasts. The sponsor that we
  tested returns the paid transaction, and the client submits it (ADR 0011).
- midnight-js 5.0.1 has no node client. Its `submitTx` gives the transaction to
  a `MidnightProvider` that the app supplies, usually the wallet SDK. The
  wallet SDK needs a wallet, and it waits for finality.
- The platform seam has HTTP only. The node has no transaction lookup, and the
  indexer has final blocks only.
- The docs said that the client submits the same transaction again when it
  does not arrive. The sponsor's DUST spend expires with its coin lock, so
  the old bytes cannot land after that time, and a new payment is then
  safe.

## Decision

1. **The client submits.** `adapter-broadcast` sends an unsigned extrinsic for
   `send_mn_transaction` with `author_submitExtrinsic`, over `Platform.http`.
   It reads a refusal from the JSON-RPC error. The call index is an option,
   with the value of midnight-node 2.1.101. A runtime that moves the call
   fails closed: the node cannot decode the extrinsic, and the refusal is
   `unknown`, stop.
2. **"In a block" from the node, "final" from the indexer.** The adapter
   polls the best block, and walks parent hashes for its own extrinsic hex.
   It needs no WebSocket and no decoder. `TransactionStatus.result` is
   `undefined` until `final`.
3. **The loop owns every new payment.** Inside one call, the broadcast
   adapter sends the same paid bytes again only after a send failed, and
   never after `submitBy`. The send loop in `core` (`createSender`) owns
   every sponsor retry and every new payment, with the action table of the
   sponsor policy.
4. **No two live payments.** After a refusal, the loop never submits those
   paid bytes again. The adapter never sends paid bytes after `submitBy`. The
   adapter, which reads the paid bytes, says when a payment can no longer
   land: it was never sent before `submitBy`, or it is past its earliest
   intent ttl plus a margin, in no block, and not indexed under any of its
   identifiers. Only then does the loop pay again. Otherwise the send fails
   with `SendUncertainError` and the payment id, and the caller decides. An
   abort after the payment counts as uncertain too, because the loop cannot
   tell if the bytes reached the node.
5. **One send at a time for each account**, inside one sender. A payment that
   can still land keeps the account's slot until the indexer shows it final,
   for at most `lostWaitMs`. This wait reads only the indexer, so it sends
   nothing. Two tabs, two devices, or two senders can still send at once.
   Only the sponsor can refuse a second open payment for one account. That is
   sponsor work.

Rejected options:

- **Submit through the wallet SDK.** It needs a wallet in the page, and it
  gives no "in a block" level.
- **A WebSocket watch** (`transactionWatch_v1_submitAndWatch`). The platform
  seam has no WebSocket. It can come later as an option.
- **Read the call index from the metadata.** It needs a SCALE metadata
  decoder. A check of the runtime version can come later.

## Consequences

- A node upgrade that moves the call index or the refusal codes needs an SDK
  change. The compatibility matrix names the node version.
- A lost transaction costs a wait until its earliest intent ttl plus a
  margin (150 s by default) before the new payment. The sponsor's fee intent
  has the ttl of its coin lock, so it is often the earliest.
- The node and the sponsor see each transaction and the client's IP address.
