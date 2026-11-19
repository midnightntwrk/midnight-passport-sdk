# 0009 — The wire version carries a major and a minor

Date: 2026/11/17 · Status: accepted
Refs: midnightntwrk/midnight-passport-sdk#79 · architecture, Example 7 ·
sdk-requirements, rule 5

## Context

`architecture.md` Example 7 showed the wire version as a bare number:
`export const PROTOCOL_VERSION = 2`. The compatibility check for the wire axis
(rule 5) must tell a breaking change from a compatible one. A bare number
cannot carry that distinction, so the check could not refuse a higher major
while accepting a change within the same major.

E03.05 (issue #79) builds the first wire-axis types and the accept-or-refuse
helper. Its acceptance tests three cases: equal, a lower minor, and a higher
major. One number cannot express both a lower minor and a higher major.

## Decision

`PROTOCOL_VERSION` is a structured value with a `major` and a `minor`:

```ts
export const PROTOCOL_VERSION: ProtocolVersion = Object.freeze({ major: 2, minor: 0 });
```

`architecture.md` Example 7 now shows this shape. The grant request still
carries `version: typeof PROTOCOL_VERSION`, so the wire message carries both
parts. The constant is frozen, so no caller can change the shared value.

The helper refuses only a higher major for now and accepts every other case.
The full rule for a higher minor and a lower major is E09.04.

We rejected two shapes. A single string such as `"2.0"` needs parsing before
every comparison. A bare major number with a separate minor constant gives one
version two names, and a caller can easily use only one.

## Consequences

- E09 message types inherit the `{ major, minor }` shape. The grant request,
  the possession proof, and the sign-in message carry it.
- E09.04 extends the helper's rule and its refusal reasons. The shape does not
  change again.
- Two more divergences for `protocol` stay open as doc-sync candidates: the
  "types and constants only, no logic" wording, and the binding-axis summary
  wording in `docs/compatibility.md`.
