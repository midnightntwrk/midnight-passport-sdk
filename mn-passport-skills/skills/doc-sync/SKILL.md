---
name: doc-sync
description: Feedback loop for the Midnight Passport SDK — when implementation reveals the design docs are wrong or stale, update docs/ and record an ADR; also owns re-checking the verify register. Use when conformance flags a justified divergence, when a verification finding contradicts a documented assumption, or when a provisional decision gets confirmed or refuted.
---

# doc-sync — did we learn the docs are wrong?

Conformance validates code against `docs/`; that only works if the docs stay
true. When reality contradicts them, the defined path is: **update the
requirements/architecture and record the decision as an ADR**
(`docs/development-workflow.md` §2). The docs are corrected — the code is
never bent to a stale doc.

## When it fires

- `mn-passport-skills:conformance` finds the code diverging from the docs for a
  *good* reason.
- `mn-passport-skills:verify` produces a "does it run" finding that contradicts a
  documented assumption (the project's two largest planning
  course-corrections were exactly this).
- A `[PROVISIONAL]` verify-register entry is confirmed or refuted.
- An upstream change invalidates a documented decision (via
  `mn-passport-skills:deps`).

## Procedure

1. **Confirm the divergence is justified.** If the code is simply wrong,
   this is a conformance blocking finding — fix the code instead.
2. **Update the docs** — `docs/sdk-requirements.md`, `docs/architecture.md`,
   `docs/beta-scope.md`, or `docs/development-workflow.md` — minimally and
   precisely; bump the affected doc's status date (YYYY/MM/DD).
3. **Record an ADR** at `docs/adr/NNNN-<slug>.md` (create the directory on
   first use; NNNN is sequential):

   ```markdown
   # NNNN — <decision title>

   Date: 2026/07/27 · Status: accepted
   Refs: midnightntwrk/passport#NN

   ## Context
   What we believed, and what reality showed.

   ## Decision
   What the docs now say, and why.

   ## Consequences
   What changes downstream (code, other docs, registers).
   ```

4. **Sweep the verify register** (`.mn-passport-skills/verify-register.md`): mark
   entries this learning closes as resolved (in place, dated); add new open
   items it surfaces. This register is owned here, fed by `mn-passport-skills:verify`.
5. **Keep the derived layers honest**: if the change invalidates part of the
   `mn-passport-skills:conformance` checklist, update that skill in the same change —
   the checklist is derived from the docs, and the docs win.

Doc updates are ordinary committed changes: they ride the current tranche's
PR, or a small standalone doc PR (the tranche budget applies either way).
