# Midnight Passport SDK roadmap

> **Status:** draft · 2026/11/09
> **Owns:** the order of work for the SDK.

## Summary

- Development starts again from the design in
  [`architecture.md`](../architecture.md) and
  [`sdk-requirements.md`](../sdk-requirements.md).
- The deliverables proposal
  ([`2026-09-25-sdk-deliverables.md`](../proposals/2026-09-25-sdk-deliverables.md))
  lists the work as deliverables (D1, D2, …), with lanes and waves. Until this
  roadmap is filled in, that proposal is the plan.
- Onboarding from a dApp through the Passport app (D16) and the private-data
  handoff (D14) are in beta (decision of 2026/10/14). A dApp never onboards a
  user; it sends the user to the Passport app (amended 2026/10/19).

## Milestones

The work is split into 9 milestones, 24 epics, and 128 stories. Each epic is in
[`epics/`](./epics/README.md) and each story in
[`stories/`](./stories/README.md), in roadmap order. The milestones are GitHub
milestones; the stories carry them, and the epics group the stories as
sub-issues.

| Milestone | Epics |
|---|---|
| 0 Agreement | E01 |
| 1 Foundation | E02 to E06 |
| 2 Account management and core actions | E07, E08 |
| 3 Control | E09 to E12 |
| 4 Private data and sync | E13 to E15 |
| 5 Account recovery | E16 to E18 |
| 6 Integrations | E19, E20 |
| 7 Execution | E21, E22 |
| 8 Use Cases | E23, E24 |

The milestones overlap: many stories can start long before their milestone,
as soon as the stories they depend on are done. Each story names its step, the
depth of its dependencies.

## Specs

To be written. Each feature spec goes in `specs/` and names its GitHub issue.
