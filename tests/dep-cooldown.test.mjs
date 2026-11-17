import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../mn-passport-skills/scripts/check-dep-cooldown.mjs', import.meta.url),
);

/** @type {string[]} */
const repos = [];
after(() => {
  for (const dir of repos) rmSync(dir, { recursive: true, force: true });
});

const DAY = 86_400_000;

// `shape` is "object" for npm 10, "array" for npm 12, or a failure.
const FAKE_NPM = `
const [, , , name] = process.argv;
const { shape, days } = JSON.parse(process.env.FAKE_NPM ?? '{}');
if (shape === 'fail') { console.error('npm error code ENOTFOUND'); process.exit(1); }
const times = { created: new Date(0).toISOString() };
if (shape !== 'no-time') times['1.0.0'] = new Date(Date.now() - days[name] * ${DAY}).toISOString();
const out = shape === 'array' ? [times] : shape === 'unknown' ? 'times' : times;
console.log(JSON.stringify(out));
`;

/** @param {string[]} names @returns {string} */
function lockfile(names) {
  const entries = names.map((n) => `  ${n}@1.0.0:\n    resolution: {integrity: sha512-x}\n`);
  return `lockfileVersion: '9.0'\n\npackages:\n\n${entries.join('\n')}`;
}

/**
 * `young` is 2 days old, and `old` is 30 days old.
 * @param {{ add: string[], shape?: string, body?: string }} options
 */
function cooldown({ add, shape = 'object', body = '' }) {
  const repo = mkdtempSync(join(tmpdir(), 'mn-passport-cooldown-'));
  repos.push(repo);
  const bin = join(repo, '.bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'fake-npm.mjs'), FAKE_NPM);
  writeFileSync(
    join(bin, 'npm'),
    `#!/bin/sh\nexec "${process.execPath}" "${bin}/fake-npm.mjs" "$@"\n`,
  );
  chmodSync(join(bin, 'npm'), 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    FAKE_NPM: JSON.stringify({ shape, days: { young: 2, old: 30 } }),
    PR_BODY: body,
  };
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: repo, env, stdio: 'ignore' },
    );
  git('init', '-q');
  writeFileSync(join(repo, 'pnpm-lock.yaml'), lockfile([]));
  git('add', 'pnpm-lock.yaml');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(repo, 'pnpm-lock.yaml'), lockfile(add));
  git('commit', '-q', '-am', 'head');
  const result = spawnSync(process.execPath, [script, 'HEAD~1'], {
    cwd: repo,
    env,
    encoding: 'utf8',
  });
  return { status: result.status, log: result.stdout + result.stderr };
}

test('a version younger than 7 days fails', () => {
  const { status, log } = cooldown({ add: ['young', 'old'] });
  assert.equal(status, 1, log);
  assert.match(log, /::error::\s+young@1\.0\.0/);
  assert.doesNotMatch(log, /old@1\.0\.0/);
});

test('a Cooldown-override: line passes the young version, and the log shows the reason', () => {
  const body = 'Summary\r\nCooldown-override: urgent fix for a CVE\r\n\r\nRefs #72\r\n';
  const { status, log } = cooldown({ add: ['young'], body });
  assert.equal(status, 0, log);
  assert.match(log, /Cooldown override in effect — "urgent fix for a CVE"/);
});

test('an empty Cooldown-override: reason does not pass', () => {
  for (const body of ['Cooldown-override:\r\n\r\nRefs #72', 'Cooldown-override:   \nRefs #72']) {
    const { status, log } = cooldown({ add: ['young'], body });
    assert.equal(status, 1, log);
    assert.doesNotMatch(log, /override in effect/);
  }
});

test('the job fails closed when npm view cannot be reached, also with an override', () => {
  const { status, log } = cooldown({
    add: ['old'],
    shape: 'fail',
    body: 'Cooldown-override: urgent',
  });
  assert.equal(status, 1, log);
  assert.match(log, /old@1\.0\.0 — could not fetch the publish times/);
});

test('the job fails closed on a missing publish time or an unknown shape', () => {
  for (const { shape, reason } of [
    { shape: 'no-time', reason: /no publish time for this version/ },
    { shape: 'unknown', reason: /unknown shape/ },
  ]) {
    const { status, log } = cooldown({ add: ['old'], shape });
    assert.equal(status, 1, log);
    assert.match(log, reason);
  }
});

test('the job reads the npm 12 array shape', () => {
  assert.equal(cooldown({ add: ['old'], shape: 'array' }).status, 0);
  assert.equal(cooldown({ add: ['young'], shape: 'array' }).status, 1);
});
