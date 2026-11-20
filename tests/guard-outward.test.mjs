import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../mn-passport-skills/scripts/guard-outward.mjs', import.meta.url),
);

/** @param {string} command @returns {{ status: number | null, asked: boolean }} */
function run(command) {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  // Kill a hung guard; a sync spawn blocks the test runner's own timeout.
  const r = spawnSync(process.execPath, [script], { input, encoding: 'utf8', timeout: 10000 });
  return { status: r.status, asked: r.stdout.includes('"permissionDecision":"ask"') };
}

/** @param {string} command */
function passes(command) {
  const { status, asked } = run(command);
  assert.equal(status, 0, command);
  assert.equal(asked, false, command);
}

/** @param {string} command */
function stops(command) {
  const { status, asked } = run(command);
  assert.equal(status, 0, command);
  assert.equal(asked, true, command);
}

test('read-only and non-outward commands pass', () => {
  for (const c of [
    'ls -la',
    'git stash push -u -m wip',
    'gh pr view 1',
    'gh search code x',
    'gh api repos/o/r/issues',
    'gh api -X GET repos/o/r',
    'pnpm exec publint run a.tgz',
    // Quoted text and a quoted heredoc cannot run.
    'git commit -m "do not git push"',
    "cat <<'EOF'\ngit push origin main\nEOF",
  ]) {
    passes(c);
  }
});

test('a mutating or unknown gh command is stopped', () => {
  for (const c of [
    'gh pr create -f',
    'gh pr merge 1',
    'gh pr comment 1 -b hi',
    'gh pr edit 1 --title x',
    'gh issue create -t x',
    'gh issue comment 1 -b hi',
    'gh issue edit 1 --title x',
    'gh release create v1',
    'gh release edit v1',
    'gh release upload v1 a.zip',
    'gh release delete v1',
    'gh release delete-asset v1 a.zip',
    'gh repo delete o/r',
    'gh run rerun 1',
    'gh workflow run x.yml',
    'gh workflow enable x',
    'gh auth login',
    'gh label create x',
    'gh secret set X',
    'gh variable set X',
    'gh gist create a.txt',
    'gh project item-create 1',
    'gh extension install o/x',
    'gh cache delete 1',
  ]) {
    stops(c);
  }
});

test('gh api asks for any method but GET, or any field flag', () => {
  for (const c of [
    'gh api -X POST repos/o/r/issues',
    'gh api -XDELETE repos/o/r',
    'gh api -X "POST" repos/o/r/issues',
    "gh api --method 'DELETE' repos/o/r",
    'gh api -X GET -X POST repos/o/r',
    'gh api --method PATCH repos/o/r',
    'gh api repos/o/r -f title=x',
    'gh api repos/o/r -ftitle=x',
    'gh api repos/o/r -F body=@f',
    'gh api repos/o/r --field a=b',
    'gh api repos/o/r --raw-field a=b',
    'gh api repos/o/r --input body.json',
  ]) {
    stops(c);
  }
});

test('a flag before the subcommand is still stopped', () => {
  for (const c of [
    'gh release -R o/r create v1',
    'gh release --repo o/r delete v1',
    'gh pr -R o/r create -f',
    'gh issue -R o/r edit 1',
  ]) {
    stops(c);
  }
});

test('push and publish are stopped, and the debts repo has no exception', () => {
  stops('git push origin main');
  stops('npm publish');
  stops('pnpm publish');
  stops('pnpm -r publish --access public');
  stops('echo mn-passport-sdk-debts; git push origin main');
});

test('a disguised or nested outward command still asks', () => {
  // A read or a stash in one segment must not shield a write in another.
  stops('git stash list; git push origin main');
  stops('git stash list $(git push origin main)');
  stops('gh pr view 1 $(gh pr merge 1)');
  stops('git -c x=stash push origin main');
  stops('bash -c "git push origin main"');
  stops("eval 'gh pr merge 1'");
  stops('cat <<EOF\n$(git push origin main)\nEOF');
});
