// PreToolUse hook (Bash matcher): the mn-passport-skills loop prepares outward actions
// but never performs them unattended — pushes, PR creation/merge, and package
// publishing require explicit human confirmation (development-workflow.md §5).
import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input.tool_name !== 'Bash') process.exit(0);
const cmd = String(input.tool_input?.command ?? '');

// Ignore text that cannot run, such as quoted text and heredoc bodies.
// Check the whole command when it can run a string, such as sh -c or eval.
// A quoted piece with no space is part of a word, as in `git 'push'`, so keep it.
// Keep no separator from it, so that it cannot split a segment.
const piece = (content) => (/\s/.test(content) ? "''" : content.replace(/[;|&()`]/g, '_'));
function outsideText(command) {
  let runs = false;
  const noHeredocs = command.replace(
    /<<-?[ \t]*(['"]?)(\w+)\1([^\n]*)\n([\s\S]*?)\n[ \t]*\2(?=\s|$)/g,
    (_m, quote, _tag, rest, body) => {
      if (!quote && /\$\(|`/.test(body)) runs = true;
      return `<<heredoc${rest}`;
    },
  );
  let out = '';
  for (let i = 0; i < noHeredocs.length; i++) {
    const c = noHeredocs[i];
    if (c === '\\') {
      const next = noHeredocs[i + 1] ?? '';
      if (next !== '\n') out += piece(next);
      i++;
    } else if (c === "'") {
      const close = noHeredocs.indexOf("'", i + 1);
      const end = close === -1 ? noHeredocs.length : close;
      out += piece(noHeredocs.slice(i + 1, end));
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < noHeredocs.length && noHeredocs[j] !== '"') j += noHeredocs[j] === '\\' ? 2 : 1;
      const content = noHeredocs.slice(i + 1, j);
      if (/\$\(|`/.test(content)) runs = true;
      out += piece(content);
      i = j;
    } else {
      out += c;
    }
  }
  if (/\$\(|`|\b(?:ba|z|da)?sh\s+-\w*c\b|\beval\b/.test(out)) runs = true;
  // A string that runs can hold quotes inside quotes, so drop every quote mark.
  return runs ? command.replace(/['"\\]/g, '') : out;
}
const text = outsideText(cmd);

// gh asks unless a command is on this read-only list, so an unknown
// subcommand asks too. gh api asks for any method but GET, or any field.
const GH_READ = {
  pr: ['view', 'list', 'status', 'checks', 'diff', 'checkout'],
  issue: ['view', 'list', 'status'],
  release: ['view', 'list', 'download', 'verify', 'verify-asset'],
  repo: ['view', 'list', 'clone'],
  run: ['view', 'list', 'watch', 'download'],
  workflow: ['view', 'list'],
  search: null,
  auth: ['status'],
  label: ['list'],
  secret: ['list'],
  variable: ['list'],
  gist: ['view', 'list'],
  project: ['view', 'list', 'item-list', 'field-list'],
  extension: ['list'],
};
function ghOutward(segment) {
  const m = /\bgh\s+(\S+)(?:\s+(\S+))?/.exec(segment);
  if (!m) return false;
  const [, group, sub] = m;
  if (group === 'api') {
    // Treat any method but GET as a write. A blanked value is not GET, so it asks.
    for (const mm of segment.matchAll(/(?:^|\s)(?:-X[ \t]*=?[ \t]*|--method[ \t=]+)(\S*)/g)) {
      if (mm[1].replace(/["']/g, '').toUpperCase() !== 'GET') return true;
    }
    // A short field flag can attach its value, so match the flag alone.
    return /(?:^|\s)(?:-[fF]|--(?:field|raw-field|input)\b)/.test(segment);
  }
  if (!(group in GH_READ)) return true;
  const allowed = GH_READ[group];
  return allowed !== null && !allowed.includes(sub);
}

// git push asks, but git stash push only saves work locally.
function gitPush(segment) {
  return /\bgit\b[\s\S]*\bpush\b/.test(segment) && !/\bgit\s+stash\b/.test(segment);
}

// Check each segment alone, and split on command substitution too, so a nested
// command cannot hide behind a read.
const segments = text.split(/[\n;|&()`]+/);
const outward =
  segments.some(gitPush) ||
  segments.some(ghOutward) ||
  // Flags such as `-r` can come before `publish`.
  segments.some((s) => /\bp?npm\b.*\bpublish\b/.test(s));

if (!outward) process.exit(0);

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason:
        'Outward action (push / PR / publish). The mn-passport-skills loop stops here for explicit human confirmation — docs/development-workflow.md §5.',
    },
  }),
);
process.exit(0);
