# E01 · Review and alignment

**Issue:** [#44](https://github.com/midnightntwrk/midnight-passport-sdk/issues/44)  
**Milestone:** 0 Agreement · **Track:** Alignment · **Steps:** 1–2 · **Stories:** 3  
**Packages:** none (Passport app or process work)  
**Sheet code:** E1  
**Readiness:** ready, no story marked to discuss

## Goal

The SDK partner and the Midnight Passport team agree on the design, the way of working, and this roadmap before any code is written, so the docs stay the single source of truth.

## Description

The SDK is built spec-driven: every feature spec is derived from the requirements, the architecture, and the provider-integration docs, and the `mn-passport-skills` plugin drives the work from a spec to merged PRs. That only works if the people writing the code accept those docs and that workflow first. This epic is that agreement.

**Architecture and requirements review.** The partner reads `docs/sdk-requirements.md`, `docs/architecture.md`, `docs/provider-integration.md`, and the ADRs, and raises findings. A finding that is accepted goes through `mn-passport-skills:doc-sync`: the doc is updated and an ADR records the decision. A finding that is rejected gets a written reason. Nothing is changed silently, and code is never bent to fit a stale doc.

**Development workflow review.** The partner reviews the skills (spec-author, spec-driver, the four review lenses, pr-open, deps, devenv), `CLAUDE.md`, CI, and the tranche budget of 400 net changed lines (600 hard). Changes to the workflow are welcome, but the non-negotiables stay: the loop never pushes or opens PRs on its own, dependencies wait 7 days before adoption, every commit is GPG-signed with a DCO sign-off, and the registers stay out of git.

**Roadmap sign-off.** Both sides agree the milestones, epics, and stories, fill in `docs/roadmap/roadmap.md` with the beta cut, and file the GitHub issues: one per epic and one per story, with the stories as sub-issues of their epic and each story in its milestone. From then on, no spec is planned without an issue.

## Scope

**In:** the review of the four SDK docs and the ADRs, the review of the development workflow, the roadmap sign-off, and filing the issues.

**Out:** any code, and any change to the planning workspace (`../passport`), which is maintained upstream.

## Stories

| # | Story | Step | Packages |
|---|---|---|---|
| E01.01 | Architecture and requirements review (doc-sync) | 1 | docs |
| E01.02 | Dev workflow review: skills, CI, non-negotiables | 1 | docs |
| E01.03 | Roadmap sign-off and issue filing | 2 | docs |

## Dependencies

**Blocked by:** nothing outside this epic.

**Unlocks:** E03 Workspace, seams, and guardrails (1 story).

**Parallel with:** no other epic in this milestone.

## Exit criteria

- Every review finding is either merged as a doc-sync PR with an ADR, or closed with a written reason.
- The partner has run one tranche end to end with the skills, from spec to a PR ready for review.
- `docs/roadmap/roadmap.md` lists the milestones and the beta cut.
- Every epic and story exists as a GitHub issue, with stories linked as sub-issues and placed in their milestone.

## Verification plan

- A walkthrough of the merged doc-sync PRs and their ADRs.
- The trial tranche passes the four lenses (conformance, security-audit, code-style, verify).
