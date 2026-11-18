import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ContractCase } from '@midnight-ntwrk/mn-passport-dev';

// Above the default contract guard, so that a hang shows as the guard error.
const timeout = 15_000;

// Short, so that a broken stub that hangs fails fast.
export const guardMs = 300;

export function run(label: string, cases: readonly ContractCase[]): void {
  for (const c of cases) test(`${label}: ${c.name}`, { timeout }, () => c.run());
}

/**
 * A test that passes when exactly the named cases fail, in order, each with an error
 * message that holds its expected text. The text proves that the case fails at the
 * intended check, not for another reason.
 */
export function expectFailing(
  name: string,
  cases: readonly ContractCase[],
  failures: readonly (readonly [caseName: string, message: string])[],
): void {
  test(name, { timeout }, async () => {
    const failed: (readonly [string, string])[] = [];
    for (const c of cases) {
      try {
        await c.run();
      } catch (error) {
        failed.push([c.name, error instanceof Error ? error.message : String(error)]);
      }
    }
    assert.deepEqual(
      failed.map(([caseName]) => caseName),
      failures.map(([caseName]) => caseName),
    );
    for (const [i, [caseName, message]] of failures.entries()) {
      const got = failed[i]?.[1] ?? '';
      assert.ok(got.includes(message), `${caseName} failed with "${got}", not "${message}"`);
    }
  });
}
