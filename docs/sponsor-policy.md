# Sponsor policy

> **Status:** draft · 2026/11/18 · the numbers are proposals until the product
> owner approves them
> **Owns:** what the sponsor pays for, its fee caps, its limit per caller, the
> client rules, and what the client does after each refusal.
> **Companions:** [`provider-integration.md`](./provider-integration.md) ("Fees
> and broadcast").

## Summary

The sponsor runs the Capacity Exchange server, and the provider runs it for
Preview. It pays fees only. The Capacity Exchange swap route is separate. The
sponsor returns the paid transaction, and the client submits it.
Enforcing this policy is work on the sponsor service, outside this repo.

## What the sponsor pays

1. **A deploy of an ACC.** Every verifier key of the deploy is in the key set
   of a published ACC build.
2. **A maintenance update on an ACC** that installs ACC verifier keys. This
   covers the later deploy waves, and adding a signing arm after the account
   exists.
3. **A transaction whose only contract calls are to ACC circuits.** This
   covers activation, owner calls, grant calls, and grant-key calls from dApps
   and agents.

A key is an ACC key when it is in the key set of a published ACC build. Each
account has its own address, so the key set is the check, not a list of
addresses.

## What the sponsor does not pay

- A transaction that also calls a contract that is not an ACC. A dApp that
  joins its own call to an ACC call pays for its part, through its own sponsor
  or the Capacity Exchange route.
- A standalone coin transfer.
- A DUST action, for example a DUST registration.
- A transaction that is not proven. An unproven transaction shows private
  inputs to the sponsor.

## Fee caps

The cap applies to the DUST that the sponsor commits to the transaction.

| Transaction type | Cap | Largest measured |
|---|---|---|
| A deploy or a maintenance update | 20 DUST | 15.96 DUST, one wave of a 5-wave plan |
| A call to an ACC circuit | 1 DUST | 0.33 DUST |

The measured values use the sponsor's fee margin of 2 blocks. A full account
costs about 73 DUST in all. Fees move with the per-block price, so the
product owner reviews the caps when the price parameters change.

## Limit per caller

The limit is per IP address, for each 24-hour window:

| Limit | Value |
|---|---|
| New accounts | 3 |
| Calls to ACC circuits | 100 |
| DUST committed, all types | 250 |
| Open payments at a time | 2 |

An open payment is one that the sponsor paid, that is not yet in a block, and
whose time limit has not passed. The sponsor has a small number of fee coins,
and each payment locks one. Two open payments stop one caller from locking
all of them.

An IP address is personal data. The sponsor keeps only a counter per IP
address for the limit window. It keeps no log of IP addresses after the
window.

## Starting balance

After activation, the sponsor's operator adds a small starting balance to a
new account. It is a deposit from the sponsor's wallet, not a user transaction
that the sponsor pays for. The token, the amount, and the limit per account
come from the starting-balance story, which records them here.

## Who can change this policy

The product owner approves each change to what is paid, the caps, and the
limits. A change is a pull request to this file. The sponsor's operator then
applies it to the sponsor's configuration.

## Client rules

1. Send proven transactions only. Do not bind the transaction, and do not add
   DUST.
2. Ask the sponsor just before you submit. Do not collect several paid
   transactions and then send them.
3. Submit the paid bytes unchanged, within the sponsor's time limit. The
   Preview sponsor's limit is 60 seconds after the call.
4. Hold at most one paid, unsent transaction for each account.
5. After a refusal, never submit the same paid bytes again. Get a new payment.
6. Never send the paid bytes after `submitBy`. When a transaction does not
   arrive, get a new payment only when it can no longer land: past its
   earliest intent ttl plus a margin, with no block that holds it and no
   indexer record for any of its identifiers. When that cannot be shown,
   stop and tell the caller. One proven transaction never has two live
   payments.
7. Check what the sponsor added. The sponsor may add exactly one intent, in
   a segment of its own. That intent holds only DUST actions: no contract
   call and no unshielded offer. The sponsor then binds the transaction. It
   changes no intent and no shielded offer of the proven transaction. If the
   paid transaction differs in any other way, do not submit it, and stop. A
   change to what the sponsor adds is a change to this policy.

## Refusals and actions

The three actions:

- **Retry.** Send the same proven transaction to the sponsor again, after a
  wait.
- **Rebuild.** Get a new paid transaction. When the refusal needs a new proof,
  build and prove again. When it does not, send the same proven transaction
  to the sponsor again. If its own time limit has passed, build and prove
  again.
- **Stop.** Do not try again. Tell the caller.

### Sponsor answers

| Answer | Error in `core` | Action |
|---|---|---|
| 503 | `SponsorBusyError` | retry |
| 2xx | none: paid | — |
| 422 with `reason: "over-fee-cap"` (proposed) | `SponsorOverCapError` | stop |
| 422 with another `reason` or none, or 400 | `SponsorNotAllowedError` | stop |
| 429 (proposed) | `SponsorCallerLimitError` | stop |
| 500, or 501 | `SponsorUnavailableError` | stop |
| 502, 504, or no answer | `SponsorUnavailableError` | retry |
| Another status below 500 | `SponsorNotAllowedError` | stop |
| Another 5xx | `SponsorUnavailableError` | stop |

Today's sponsor has no answer for "over the cap" or "caller limit". The two
proposed rows need the server work below.

### Node refusals

The node answers JSON-RPC error 1010 with `Custom error: <code>`. The codes are
those of `midnight-node` 2.1.101. Every refusal is a `NodeRefusedError` with a
`reason`.

| Code | Reason | Action | New proof |
|---|---|---|---|
| 228, 242 | `expired-intent` | rebuild | yes |
| 170 | `dust-proof-refused` | rebuild | no |
| 196 | `dust-double-spend` | rebuild | no |
| 104 | `transcript-rejected` | rebuild, or stop on out of gas | yes |
| 138 | `fee-too-low` | stop | no |
| 232, or 1010 with "would exhaust the block limits" | `over-block-limit` | stop | no |
| Another code or text | `unknown` | stop | no |

- 104 is a stale read or a call that ran out of gas. The node gives no other
  sign. When the build gives a check, the loop asks it. If the state did not
  move and the cost is over the gas, the send stops with `OutOfGasError` and
  pays no more. In all other cases the loop pauses for a random time up to
  `contentionPauseMs`, and then rebuilds. A rebuild helps only if it reads the state and the ledger
  parameters from the chain again.
- On 196, check the chain before the rebuild. The earlier transaction can
  already be in a block.
- 138 stops, because the sponsor has one fixed fee margin. A rebuild gets the
  same fee.
- Over the block limit stops. The deploy planner must split the transaction.
- JSON-RPC error 1013, "Transaction Already Imported", is not a refusal. The
  node holds the transaction.

## Server work

These changes are on the sponsor service, outside this repo:

- Replace "sponsor every transaction" with the check of "What the sponsor
  pays".
- Apply the fee caps and the limit per caller, with the two proposed answers.
- Release a coin lock when the sponsor call fails.
- Refuse a second open payment for the same account. The client sends one
  transaction at a time for each account only inside one running SDK, so
  two tabs or two devices can still send at once.
- Keep no IP address after the limit window.

## Open questions

Each question has a picked default. The product owner confirms them.

- **Limit per caller.** Per IP, a sign-up token, or a budget per account?
  Default: per IP, because the client does not change. The sponsor keeps only
  a counter per IP for the window, because an IP is personal data.
- **Server work.** Default: this doc lists it, and the team that owns the
  sponsor code tracks it.
- **Fee caps.** Default: 20 DUST for each wave and 1 DUST for each call.
  Fees follow the block price, so review the caps when the price changes. A
  cap as a multiple of the computed fee is the other choice.
- **Wire form of the new refusals.** Default: over the cap is 422 with
  `reason: "over-fee-cap"`. The caller limit is 429 with `Retry-After`. A 422
  without `reason` stays "not allowed", so the current server still works.
- **A dApp call joined to an ACC call.** Default: the sponsor does not pay it.
  The dApp pays its own part. E21.01 (intent joiner) decides.
- **Fee too low (138).** The sponsor has one fixed fee margin. Default: 138
  stops. With a margin per request, 138 becomes a rebuild.
- **A new signing arm later.** It is a large maintenance update. Default: the
  sponsor pays it, inside the cap for a wave.
- **A dropped transaction.** `provider-integration.md` says to submit the same
  bytes again. Tests suggest a new payment. Default: E04.04 (broadcast)
  decides and updates the doc.
- **1010 without a custom code.** Tests saw "would exhaust the block limits"
  only for a transaction too large for a block. Default: stop. If a full block
  also gives it, the row becomes a bounded retry.
- **The starting balance.** Default: the sponsor's operator funds it. E04.09
  decides the token and the amount, and records them here.

## Sources

- [`provider-integration.md`](./provider-integration.md), "The sponsor" and
  "Monitoring until final"; [`sdk-requirements.md`](./sdk-requirements.md),
  "Fees and broadcast" and normative rule 14.
- `midnight-node` tag `node-2.1.101`, `ledger/src/ledger_9/types.rs`, and
  `midnight-docs`, `docs/nodes/error-codes.mdx`: the node codes.
- Capacity Exchange server 2.0.0, `apps/server/src/routes/midnight/sponsor.ts`:
  the sponsor's answers.
- Fees, coin locks, and the time limit: measured in tests on Preview and on a
  local chain, 2026/11.
