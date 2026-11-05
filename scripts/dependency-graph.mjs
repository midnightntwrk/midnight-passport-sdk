// The dependency graph of docs/architecture.md ("Dependency rules"). Two
// layers consume it: the import-level lint (scripts/lint-boundaries.mjs) and
// the manifest and project-reference check (scripts/dependency-rules.mjs,
// run by tests/dependency-rules.test.mjs). A package that is not scaffolded
// yet is skipped, so the graph can list the full target.
export const SCOPE = '@midnight-ntwrk/mn-passport-';

const FOUNDATION = ['core', 'contract', 'protocol'];

/** @type {Record<string, string[]>} */
export const ALLOWED = {
  // Foundation
  protocol: [],
  contract: [],
  core: ['contract', 'protocol'],
  // Entry libraries: never `owner` outside the Passport app
  owner: FOUNDATION,
  connect: FOUNDATION,
  agent: FOUNDATION,
  ecosystems: ['protocol'],
  // Shared adapters: the package that defines the seam
  'adapter-prover-remote': ['core'],
  'adapter-broadcast': ['core'],
  'adapter-fee-capacity-exchange': ['core'],
  'adapter-browser': ['core'],
  'adapter-nodejs': ['core'],
  'adapter-waas': ['core'],
  'adapter-multi-chain': ['core'],
  'adapter-prover-wasm': ['core'],
  'adapter-wpp-drive': ['core'],
  // Passport-app adapters: seams from `owner`
  'adapter-recovery': ['owner'],
  'adapter-did': ['owner'],
};

// Packages that hold no platform code (`owner` and the foundation), plus the
// browser entry libraries.
export const PLATFORM_NEUTRAL = new Set([
  'protocol',
  'contract',
  'core',
  'owner',
  'connect',
  'ecosystems',
]);

// The Passport-app adapters: they implement a seam from `owner`.
export const PASSPORT_APP_ADAPTERS = Object.keys(ALLOWED).filter((pkg) =>
  (ALLOWED[pkg] ?? []).includes('owner'),
);

// Packages that no path may reach from the key, not even transitively.
/** @type {Record<string, string[]>} */
export const NEVER_REACHES = {
  connect: ['owner', ...PASSPORT_APP_ADAPTERS],
  agent: ['owner', ...PASSPORT_APP_ADAPTERS],
  ecosystems: [
    'owner',
    'core',
    ...Object.keys(ALLOWED).filter((pkg) => pkg.startsWith('adapter-')),
  ],
};
