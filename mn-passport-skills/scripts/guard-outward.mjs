// PreToolUse hook (Bash matcher): the mn-passport-skills loop prepares outward actions
// but never performs them unattended — pushes, PR creation/merge, and package
// publishing require explicit human confirmation (development-workflow.md §5).
// Recorded exception: pushes to the private ../mn-passport-sdk-debts register.
import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (input.tool_name !== 'Bash') process.exit(0);
const cmd = String(input.tool_input?.command ?? '');

// An outward action somewhere in the command line (any pipeline segment).
const outward =
  /\bgit\b[^\n;|&]*\bpush\b/.test(cmd) ||
  /\bgh\s+pr\s+(create|merge)\b/.test(cmd) ||
  /\bgh\s+release\b/.test(cmd) ||
  /\bnpm\s+publish\b/.test(cmd);

if (!outward) process.exit(0);

// The recorded exception: the security register lives in the private debts
// repo, which exists precisely to receive these pushes.
if (/mn-passport-sdk-debts/.test(cmd)) process.exit(0);

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
