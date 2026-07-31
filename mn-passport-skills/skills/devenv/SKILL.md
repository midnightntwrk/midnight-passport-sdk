---
name: devenv
description: Development-environment gate for the Midnight Passport SDK — checks the private debts repo, HTTPS secure context for passkeys, devnet, proof server, Compact CLI, and the Node toolchain. Run before starting a tranche, or whenever the environment misbehaves.
---

# devenv — is the environment ready?

Guards the loop's step (a) (`docs/development-workflow.md` §3): a tranche
does not start against a broken environment. Check everything, report a
ready/not-ready table, and fix (or hand the user the fix) before proceeding.

## Checks

1. **Private debts repo** — the security register's home:

   ```bash
   git -C ../mn-passport-sdk-debts ls-remote origin
   ```

   Must exist beside this repo and be pushable. If missing, ask the user to
   clone their private `mn-passport-sdk-debts` repo at that path —
   `mn-passport-skills:security-audit` cannot record findings without it, which
   blocks the loop.

2. **HTTPS secure context** — passkey / WebAuthn PRF flows require a secure
   context **even locally**; a plain `http://localhost` redirect will not do
   for the flows under test. Local TLS via mkcert or Caddy (or the dev
   server's HTTPS mode); confirm the dev origin actually serves HTTPS before
   testing ceremony code.

3. **Devnet + proof server** — use the `midnight-tooling:devnet` skill for
   status/health, the `midnight-tooling:proof-server` skill for the proof
   server (port 6300), and the midnight-wallet localnet tools as needed.

4. **Compact CLI** — `compact check` and `compact self check` for versions
   (upgrade before compiling any `.compact`); the `midnight-tooling:doctor`
   skill for a full installation diagnosis.

5. **Node toolchain** — Node version against `.nvmrc` / `package.json`
   engines once they exist; lockfile present and clean.

## Output

A short table: check · status · fix (if any). Blocking items — the debts
repo, and whatever the current tranche actually exercises (devnet for
E2E work, HTTPS for ceremony work) — must be green before implementation
starts; the rest are warnings.
