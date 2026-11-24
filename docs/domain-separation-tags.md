# Domain-separation tags

> **Status:** live · 2026/11/18
> **Owns:** the domain-separation tags the SDK uses.
> A row changes only through a reviewed PR.

A tag is the domain prefix that a hash or a signature mixes in. A value made
for one purpose then cannot be replayed for another. `mn-passport-protocol`
exports every tag from one module, `domain-tags.ts`.

A caller length-prefixes or frames a tag before it hashes it, so a tag cannot
collide with the start of a longer tag, and `:v1` cannot collide with `:v10`.
A tag that is the whole input, such as a PRF input or an HKDF info, needs no
frame.

The SDK authors the message tags under `midnight:passport:<area>:<purpose>:v<n>`.
The four recovery tags come from MIP-0022 and keep its `midnight:account:` names.
The device-call tags and the connector prefix come from the account contract.
They follow the ACC binding version, not the wire version. The SDK keeps one
prefix for each arm, and the contract appends the operation name.

| Tag | Purpose | Used by | Owner |
|---|---|---|---|
| `midnight:passport:grant:request:v1` | The grant request message. | The grant request, browser and agent. | SDK |
| `midnight:passport:grant:possession:v1` | The possession proof. | The grant ceremony. | SDK |
| `midnight:passport:signin:message:v1` | The sign-in message. | The sign-in message. | SDK |
| `midnight:account:recovery:guardian:v1` | The guardian-secret derivation. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:share:v1` | The share derivation. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:submit:v1` | The recover-gate signature challenge. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:wrap:v1` | The viewing-key wrap. | Guardian recovery. | MIP-0022 |
| `midnight:account:auth:v1:<operation>` | The challenge of a JubJub device call. | The JubJub key providers. | Account contract |
| `midnight:account:auth:k1:v1:<operation>` | The challenge of a k256 device call. | The k256 key providers. | Account contract |
| `midnight:account:auth:r1:v1:<operation>` | The challenge of a p256 device call. | The p256 key providers. | Account contract |
| `midnight_signed_message:32:` | The digest prefix of a k256 key on envelope 1. | The k256 envelope digest. | Account contract |
| `midnight:passport:prf:authority:v1` | The PRF input of the authority wrap, hashed with SHA-256. | Account creation, maintenance updates. | SDK |
| `midnight:passport:prf:viewing:v1` | The PRF input of the viewing-key wrap, hashed with SHA-256. | Account creation, session start. | SDK |
| `midnight:passport:authority:wrap:v1` | The HKDF info of the authority wrap key. | Account creation, maintenance updates. | SDK |
| `midnight:passport:viewing:wrap:v1` | The HKDF info of the viewing-key wrap key. | Account creation, session start. | SDK |
| `midnight:passport:store:key:v1` | The HKDF info of the local store key, from the viewing secret. | The local private-state store. | SDK |

The five `prf` and HKDF rows come from ADR 0014. The first four join
`domain-tags.ts` with the account deploy, and the store-key tag with the local
store.

The KeyProvider (#86) is the first story these tags unlock.

## Deferred

The device enrollment request is a signed SDK message. It needs a
`midnight:passport:` tag, which lands with the device-enrollment story.
