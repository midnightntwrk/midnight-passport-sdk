---
name: spec-author
description: Author a Midnight Passport SDK per-feature spec from the architecture, roadmap, and the milestone brief in docs/roadmap/milestones/. Use before spec-driver — turn an FS-x.y brief into a full spec (scope, decisions, interfaces, acceptance, verify plan, proposed tranches, GitHub issue) that spec-driver can then plan and loop. Does not finalise gated tranches, write code, or perform outward actions.
---

# spec-author — write the spec, then hand off

The upstream of the mn-passport-skills spine (`docs/development-workflow.md` §2–3).
`spec-driver` *begins by reading* a spec (its plan phase, step 1); this skill
*produces* that spec. It expands a feature-spec brief in
`docs/roadmap/milestones/` into a full, derivable per-feature spec grounded in
the source-of-truth docs.

## Inputs

- The target **`FS-x.y` brief** from `docs/roadmap/milestones/M*.md` (index:
  `docs/roadmap/milestones/README.md`).
- Source of truth: `docs/sdk-requirements.md` (what/why), `docs/architecture.md`
  (how), `docs/beta-scope.md` (v1 scope).
- Sequencing and dependencies: `docs/roadmap/roadmap.md`.
- Provider / proving-service detail: `docs/provider-integration.md`.

## Hard rules

1. **Derive, do not invent.** Every normative statement — a MUST, an interface,
   a decision — must trace to a section of the source docs. Where the docs are
   silent or contradictory, record it under **open questions** and flag
   `mn-passport-skills:doc-sync`; never freestyle a normative decision into a spec.
2. **Name the issue.** The finished spec must name its GitHub issue from
   [midnightntwrk/passport](https://github.com/midnightntwrk/passport/issues).
   If none is known, **STOP and ask** the user before finishing. This is the
   same gate `spec-driver` enforces, pulled forward so planning never stalls.
3. **Respect the MUSTs.** Ceremony gate (requirements §2.2),
   encrypt-preimage-to-enclave (§2.5), deposit-not-address (§3.12), `connect`
   never links `core` (architecture §4.4), and the two version axes (§4.6). The
   spec must not contradict these.
4. **Author only.** Do not decide the final **gated** tranche boundaries (that
   is `spec-driver`'s plan phase), do not write code, and never perform outward
   actions. Produce a *proposed* tranche outline for `spec-driver` to finalise
   against its size budget.

## Steps

1. Read the `FS-x.y` brief and every backing doc section it names.
2. Expand it into a full spec with these parts:
   - **Objective** and **scope** (in / out).
   - **Decisions** — each with a one-line rationale and a doc citation.
   - **Surface & interfaces** — concrete types and signatures (finalise the
     brief's indicative sketches).
   - **Flow** — the sequence this feature performs; reference
     `provider-integration.md` §3 where the provider or the proving & settlement
     service are involved.
   - **Dependencies** — internal feature specs and the external gate (the
     provider, the proving & settlement service, the contract team), noting what
     is mockable now versus what waits on a gate.
   - **Acceptance criteria** — observable.
   - **Verify plan** — what `mn-passport-skills:verify` will drive end-to-end, and the
     mocks that stand in for an unready gate.
   - **Proposed tranches** — an ordered outline, each a single reviewable
     concern, sized with the ≤ 400-net-line budget in mind (a proposal, not the
     final gated plan).
   - **Open questions** and the **GitHub issue**.
3. Where the source docs cannot answer a normative question, add it to open
   questions and hand to `mn-passport-skills:doc-sync` rather than guessing.
4. Write the spec as **one file per feature spec** under
   `docs/roadmap/specs/<milestone>/` — one subfolder per milestone (e.g.
   `docs/roadmap/specs/M1-managed-onboarding/FS-1.4-prover-remote.md`) —
   leaving the milestone files in `docs/roadmap/milestones/` as the index of
   briefs. Present it to the human.
5. On approval, hand off to `mn-passport-skills:spec-driver` (plan phase), which confirms
   the issue, finalises the gated tranches, and loops.

## Boundaries

- Finalising gated tranches and looping implementation → `mn-passport-skills:spec-driver`.
- Correcting the source docs → `mn-passport-skills:doc-sync`.
- No branches, pushes, or PRs — ever.
