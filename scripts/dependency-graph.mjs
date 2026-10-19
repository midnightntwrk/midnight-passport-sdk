// The dependency graph of docs/architecture.md ("Dependency rules"). Two
// layers consume it: the import-level lint (scripts/lint-boundaries.mjs) and
// the manifest and project-reference check (scripts/dependency-rules.mjs,
// run by tests/dependency-rules.test.mjs). A package that is not scaffolded
// yet is skipped, so the graph can list the full target.
export const SCOPE = '@midnight-ntwrk/mn-passport-';

const FOUNDATION = ['account', 'contract', 'protocol'];

/** @type {Record<string, string[]>} */
export const ALLOWED = {
  // Foundation
  protocol: [],
  contract: [],
  account: ['contract', 'protocol'],
  // Entry libraries: never `core` outside the Passport app
  core: FOUNDATION,
  connect: FOUNDATION,
  agent: FOUNDATION,
  ecosystems: ['protocol'],
  // Shared adapters: the package that defines the seam
  'adapter-prover-remote': ['account'],
  'adapter-broadcast': ['account'],
  'adapter-fee-capacity-exchange': ['account'],
  'adapter-browser': ['account'],
  'adapter-nodejs': ['account'],
  'adapter-waas': ['account'],
  'adapter-multi-chain': ['account'],
  'adapter-prover-wasm': ['account'],
  // Passport-app adapters: seams from `core`
  'adapter-storage-wpp': ['core'],
  'adapter-recovery': ['core'],
  'adapter-did': ['core'],
};

// Packages that hold no platform code (`core` and the foundation), plus the
// browser entry libraries.
export const PLATFORM_NEUTRAL = new Set([
  'protocol',
  'contract',
  'account',
  'core',
  'connect',
  'ecosystems',
]);

// The Passport-app adapters: they implement a seam from `core`.
export const PASSPORT_APP_ADAPTERS = Object.keys(ALLOWED).filter((pkg) =>
  (ALLOWED[pkg] ?? []).includes('core'),
);

// Packages that no path may reach from the key, not even transitively.
/** @type {Record<string, string[]>} */
export const NEVER_REACHES = {
  connect: ['core', ...PASSPORT_APP_ADAPTERS],
  agent: ['core', ...PASSPORT_APP_ADAPTERS],
  ecosystems: [
    'core',
    'account',
    ...Object.keys(ALLOWED).filter((pkg) => pkg.startsWith('adapter-')),
  ],
};
