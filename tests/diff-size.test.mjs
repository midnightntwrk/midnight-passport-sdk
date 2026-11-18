import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../mn-passport-skills/scripts/check-diff-size.sh', import.meta.url),
);

/** @type {string[]} */
const repos = [];
after(() => {
  for (const dir of repos) rmSync(dir, { recursive: true, force: true });
});

const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_') && k !== 'PR_BODY'),
);
env.GIT_CONFIG_GLOBAL = '/dev/null';
env.GIT_CONFIG_NOSYSTEM = '1';
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false'];

/** @type {Map<string, string>} */
const built = new Map();

/**
 * One repo per size, so each body or flag runs on the same commits.
 * @param {number} n counted lines the HEAD commit adds
 * @param {Record<string, number>} [extra]
 */
function repoOf(n, extra = {}) {
  const key = JSON.stringify([n, extra]);
  const found = built.get(key);
  if (found) return found;
  const repo = mkdtempSync(join(tmpdir(), 'mn-passport-diffsize-'));
  repos.push(repo);
  built.set(key, repo);
  /** @param {string[]} args */
  const git = (...args) =>
    execFileSync('git', [...GIT, ...args], { cwd: repo, env, stdio: 'ignore' });
  /** @param {string} rel @param {number} count */
  const write = (rel, count) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), Array.from({ length: count }, (_, i) => `x ${i}\n`).join(''));
  };
  git('init', '-q');
  write('base.txt', 1);
  git('add', 'base.txt');
  git('commit', '-q', '-m', 'base');
  const files = { 'f.txt': n, ...extra };
  for (const [rel, count] of Object.entries(files)) write(rel, count);
  git('add', ...Object.keys(files));
  git('commit', '-q', '-m', 'head');
  return repo;
}

/**
 * @param {number} n
 * @param {{ body?: string, ci?: boolean, extra?: Record<string, number> }} [options]
 * @returns {{ status: number | null, log: string }}
 */
function sized(n, { body, ci = false, extra } = {}) {
  // Kill a hung script so a broken git path fails fast, not at 120 s.
  const r = spawnSync('bash', [script, 'HEAD~1', ...(ci ? ['--ci'] : [])], {
    cwd: repoOf(n, extra),
    env: body === undefined ? env : { ...env, PR_BODY: body },
    encoding: 'utf8',
    timeout: 15000,
  });
  return { status: r.status, log: r.stdout + r.stderr };
}

test('at or below 400 passes with no budget message', () => {
  const { status, log } = sized(400);
  assert.equal(status, 0, log);
  assert.match(log, /: 400$/m);
  assert.doesNotMatch(log, /over the/);
});

test('401 to 600 warns and passes', () => {
  for (const n of [401, 600]) {
    const { status, log } = sized(n);
    assert.equal(status, 0, log);
    assert.match(log, /over the 400-line soft budget/);
  }
});

test('above 600 without an override fails, and an unset PR_BODY is safe', () => {
  const { status, log } = sized(601);
  assert.equal(status, 1, log);
  assert.match(log, /over the 600-line budget/);
  assert.doesNotMatch(log, /unbound variable/);
});

// The reason is undefined when the override must not pass.
for (const [label, body, reason] of /** @type {[string, string, string | undefined][]} */ ([
  ['an override line', 'Sum\r\nBudget-override: migration\r\n\r\nmore\r\n', 'migration'],
  ['leading blanks', '   Budget-override: y\r\n', 'y'],
  ['a bare CR as the line start', 'x\rBudget-override: y\r\n', 'y'],
  ['an empty reason, CRLF', 'Budget-override:\r\nnext line reason\r\n', undefined],
  ['a blank reason, LF', 'Budget-override:   \nnext line reason\n', undefined],
  ['an empty reason, bare CR', 'Budget-override:\rnext line reason\r', undefined],
  ['the token inside a line', 'see Budget-override: y\r\n', undefined],
])) {
  test(`above 600 with ${label}`, () => {
    const { status, log } = sized(601, { body });
    if (reason === undefined) {
      assert.equal(status, 1, log);
      assert.doesNotMatch(log, /in effect/);
    } else {
      assert.equal(status, 0, log);
      assert.match(log, new RegExp(`Budget-override in effect: ${reason}\n`));
    }
  });
}

test('--ci fails above 600, and the override makes it a passing warning', () => {
  const fail = sized(601, { ci: true });
  assert.equal(fail.status, 1, fail.log);
  assert.match(fail.log, /::error::/);
  const pass = sized(601, { ci: true, body: 'Budget-override: migration\r\n' });
  assert.equal(pass.status, 0, pass.log);
  assert.match(pass.log, /::warning::/);
  assert.match(sized(401, { ci: true }).log, /::warning::/);
  assert.doesNotMatch(sized(601).log, /::error::/);
});

test('the count excludes lockfiles and fixtures', () => {
  const { status, log } = sized(10, {
    extra: { 'pnpm-lock.yaml': 500, 'packages/p/fixtures/big.json': 500 },
  });
  assert.equal(status, 0, log);
  assert.match(log, /: 10$/m);
});
