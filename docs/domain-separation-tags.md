# Domain-separation tags

> **Status:** live · 2026/11/18
> **Owns:** the domain-separation tags the SDK uses.
> A row changes only through a reviewed PR.

A tag is the domain prefix that a hash or a signature mixes in. A value made
for one purpose then cannot be replayed for another. `mn-passport-protocol`
exports every tag from one module, `domain-tags.ts`.

A caller length-prefixes or frames a tag before it hashes it, so a tag cannot
collide with the start of a longer tag, and `:v1` cannot collide with `:v10`.

The SDK authors the message tags under `midnight:passport:<area>:<purpose>:v<n>`.
The four recovery tags come from MIP-0022 and keep its `midnight:account:` names.

| Tag | Purpose | Used by | Owner |
|---|---|---|---|
| `midnight:passport:grant:request:v1` | The grant request message. | The grant request, browser and agent. | SDK |
| `midnight:passport:grant:possession:v1` | The possession proof. | The grant ceremony. | SDK |
| `midnight:passport:signin:message:v1` | The sign-in message. | The sign-in message. | SDK |
| `midnight:account:recovery:guardian:v1` | The guardian-secret derivation. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:share:v1` | The share derivation. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:submit:v1` | The recover-gate signature challenge. | Guardian recovery. | MIP-0022 |
| `midnight:account:recovery:wrap:v1` | The viewing-key wrap. | Guardian recovery. | MIP-0022 |

The KeyProvider (#86) is the first story these tags unlock.

## Deferred

The device enrollment request is a signed SDK message. It needs a
`midnight:passport:` tag, which lands with the device-enrollment story.
