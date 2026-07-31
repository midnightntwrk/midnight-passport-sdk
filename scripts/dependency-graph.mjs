// The architecture §4.4 dependency graph — the single source both
// enforcement layers consume: scripts/lint-boundaries.mjs (import level)
// and tests/dependency-rules.test.mjs (manifest and tsconfig level).
export const SCOPE = '@midnight-ntwrk/mn-passport-';

/** @type {Record<string, string[]>} */
export const ALLOWED = {
  protocol: [],
  contract: [],
  core: ['contract', 'protocol'],
  connect: ['protocol', 'contract'],
  'adapter-signer-managed': ['core'],
  'adapter-signer-local': ['core'],
  'adapter-prover-remote': ['core'],
};
