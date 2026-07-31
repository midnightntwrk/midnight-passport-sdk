---
name: code-style
description: Project coding-preference review lens for Midnight Passport SDK changes — British English with Oxford comma, YYYY/MM/DD dates, TypeScript conventions, error-taxonomy consistency, and Midnight (not IOG) branding. Run per tranche, or on any change touching prose, UI copy, or public API shape.
---

# code-style — project preferences

The judgment layer over prose, naming, and conventions
(`docs/development-workflow.md` §2). The mechanical part — formatting and
lint — is CI's job: run the formatter rather than hand-reviewing whitespace,
and never nitpick what a tool enforces.

## Prose (comments, docs, error messages, UI copy)

- **British English**, with the **Oxford comma**.
- Dates as **YYYY/MM/DD**.
- Complete sentences in doc comments and user-facing text; comments state
  constraints the code can't show, not narration of the next line.
- If `.claude/rules/` exists in the repo, read it — it is authoritative for
  anything it covers.

## Brand

- Midnight Passport is a **Midnight-branded** product, never IOG-branded:
  product name "Midnight Passport", package scope `@midnight-ntwrk/`.
- UI copy follows the Midnight brand voice; integrators may re-brand
  upstream components (§3.11), but our defaults are Midnight.

## TypeScript conventions

- **No `any`** — the prototype's `any`-typed provider boundary is an
  explicitly named failure (arch §7). Strict mode; exported API surfaces
  fully and explicitly typed.
- **Type as much as you can** (human rule, 2026/07/30 — raised on PR #8):
  `unknown` is a last resort, not a default. Before reaching for it, mirror
  the shape structurally (as `AccWitnesses`/`AccPureCircuits` do for the
  generated module), or take a generic parameter so the consumer can supply
  the type (`bindAccModule<PS>`). Every `unknown` that survives must carry a
  doc comment naming **why** it cannot be typed here and **who owns** the
  type (e.g. a runtime-owned type the package must not import, or a
  consumer-defined type whose owner is a later spec). An undocumented
  `unknown` on an exported surface is a review finding.
- **No module-global singletons** — instance-scoped, disposable objects
  (arch §4.3); multi-account must be possible.
- **Error taxonomy consistency** — typed error classes with stable codes,
  one taxonomy across packages; no stringly-typed or ad-hoc thrown errors on
  public surfaces. Error messages must never contain secret material (that
  is also a `security-audit` blocking finding).
- Async discipline: no floating promises; abort/cleanup paths on
  long-running flows.

## UI (when the tranche touches user-facing surfaces)

- Copy is i18n-ready — no string concatenation of sentence fragments.
- A11y basics: labels, focus order, and keyboard paths on ceremony and
  consent dialogs especially — those are the security-critical interactions.
- Proof-provenance and remote-proving indicators (§2.5) use plain,
  non-technical language: "proved in this browser" / "proved in a remote
  enclave".

## Output

Findings list. **Blocking** only for: brand violations, error-taxonomy
breaks on public surfaces, `any` on exported APIs, and module-global
singletons. Everything else is advisory — style feedback should not stall a
tranche.
