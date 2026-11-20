import { createRequire } from 'node:module';
import { Effect } from 'effect';
import { fromPromise, fromV3, type V3Runner } from '../../../../packages/core/src/midnight-js.js';

interface Effect3 extends V3Runner {
  succeed(value: unknown): unknown;
}

/** Resolves to `promise v3`, through both adapter calls. */
export function probe(): Promise<string> {
  const fromCompactJs = createRequire(
    createRequire(import.meta.url).resolve('@midnight-ntwrk/compact-js/package.json'),
  );
  const E3 = (fromCompactJs('effect') as { readonly Effect: Effect3 }).Effect;
  return Effect.runPromise(
    Effect.all([
      fromPromise(() => Promise.resolve('promise')),
      fromV3<string>(E3, () => E3.succeed('v3')),
    ]).pipe(Effect.map((parts) => parts.join(' '))),
  );
}
