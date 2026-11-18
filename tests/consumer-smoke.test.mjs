import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '../scripts/bundle-packages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// Without a pin, corepack fetches the newest pnpm, and that release can be under the cooldown.
const { packageManager, devDependencies } =
  /** @type {{ packageManager: string, devDependencies: { '@midnight-ntwrk/midnight-js': string } }} */ (
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  );
const PACKED = [
  'packages/protocol',
  'packages/contract',
  'packages/core',
  'tests/fixtures/consumer-probe',
];
const MIDNIGHT_JS = {
  '@midnight-ntwrk/midnight-js': devDependencies['@midnight-ntwrk/midnight-js'],
};
const INSTALL = {
  npm: ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
  pnpm: ['install', '--ignore-scripts'],
  bun: ['install', '--ignore-scripts'],
};

// A sync call blocks the test timeout, so each command has its own.
/** @param {string} cmd @param {string[]} args @param {string} cwd */
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 5 * 60_000 });

/** @param {string} cmd */
const installed = (cmd) => {
  try {
    run(cmd, ['--version'], root);
    return true;
  } catch {
    return false;
  }
};

/** @param {string} dir @returns {string | undefined} */
const versionAt = (dir) =>
  existsSync(join(dir, 'package.json'))
    ? /** @type {{ version?: string }} */ (
        JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      ).version
    : undefined;

// Counts real `effect` folders only: a symlink points at a folder counted elsewhere.
/** @param {string} modules @param {string[]} versions */
const effectCopies = (modules, versions = []) => {
  if (!existsSync(modules)) return versions;
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(modules, entry.name);
    if (entry.name === '.pnpm' || entry.name === '.bun') {
      for (const id of readdirSync(path)) effectCopies(join(path, id, 'node_modules'), versions);
    } else if (entry.name.startsWith('@')) {
      for (const pkg of readdirSync(path)) effectCopies(join(path, pkg, 'node_modules'), versions);
    } else {
      if (entry.name === 'effect') versions.push(versionAt(path) ?? '?');
      effectCopies(join(path, 'node_modules'), versions);
    }
  }
  return versions;
};

test(
  'the packed SDK installs next to midnight-js with one Effect 3 copy',
  {
    skip: process.env.PASSPORT_CONSUMER_SMOKE !== '1' && 'set PASSPORT_CONSUMER_SMOKE=1',
    timeout: 30 * 60_000,
  },
  async (t) => {
    // Each run installs three dependency trees. SMOKE_TMPDIR can move them off a RAM disk.
    const scratch = mkdtempSync(join(process.env.SMOKE_TMPDIR ?? tmpdir(), 'mn-passport-smoke-'));
    try {
      await bundle('tests/fixtures/consumer-probe');
      /** @type {Record<string, string>} */
      const tarballs = {};
      for (const dir of PACKED) {
        const packed = /** @type {{ name: string, filename: string }} */ (
          JSON.parse(
            run('pnpm', ['pack', '--pack-destination', scratch, '--json'], join(root, dir)),
          )
        );
        tarballs[packed.name] = `file:${packed.filename}`;
      }

      for (const [manager, args] of Object.entries(INSTALL)) {
        await t.test(
          manager,
          { skip: manager === 'bun' && !installed(manager) && 'bun is not installed' },
          () => {
            const app = join(scratch, manager);
            mkdirSync(app);
            // Overrides make core's `0.0.0` dependencies resolve to the tarballs.
            const manifest = {
              name: 'app',
              private: true,
              type: 'module',
              packageManager,
              dependencies: { ...tarballs, ...MIDNIGHT_JS },
              overrides: tarballs,
            };
            writeFileSync(join(app, 'package.json'), JSON.stringify(manifest, null, 2));
            // Newer pnpm releases read overrides only from this file. JSON is valid YAML.
            writeFileSync(
              join(app, 'pnpm-workspace.yaml'),
              JSON.stringify({ overrides: tarballs }),
            );
            run(manager, args, app);

            const script =
              "await import('@midnight-ntwrk/mn-passport-core');" +
              "const { probe } = await import('mn-passport-consumer-probe');" +
              'console.log(await probe());';
            assert.equal(
              run('node', ['--input-type=module', '-e', script], app).trim(),
              'promise v3',
            );

            const copies = effectCopies(join(app, 'node_modules'));
            assert.deepEqual(
              copies.filter((v) => v.startsWith('3.')).length,
              1,
              `effect copies: ${copies.join(', ')}`,
            );
            assert.doesNotMatch(versionAt(join(app, 'node_modules/effect')) ?? 'none', /^4\./);
          },
        );
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);
