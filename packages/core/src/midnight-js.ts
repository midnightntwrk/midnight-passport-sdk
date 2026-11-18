import { Effect } from 'effect';
import { UpstreamError } from './upstream-error.js';

// The foundation has no platform types, so `AbortSignal` is not in scope.
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/**
 * An Effect 3 `ManagedRuntime` and the Effect 3 `Effect` module both match.
 * The effect and its exit are `never` and `unknown` because Effect 3 types must not reach SDK code.
 */
export interface V3Runner {
  runPromiseExit(effect: never, options?: { readonly signal?: AbortSignalLike }): Promise<unknown>;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

// Reads identifiers only, never the message. Undefined when a getter throws.
function toUpstreamError(reason: unknown): UpstreamError | undefined {
  try {
    const ctor = field(reason, 'constructor');
    return new UpstreamError({
      sourceTag:
        text(field(reason, '_tag')) ??
        text(field(reason, 'name')) ??
        text(typeof ctor === 'function' ? ctor.name : undefined),
      sourceCode: text(field(reason, 'code')),
    });
  } catch {
    return undefined;
  }
}

// An upstream defect can hold keys too, so only its identifiers cross.
const scrubbed = (defect: unknown): UpstreamError =>
  toUpstreamError(defect) ?? new UpstreamError({});

const failed = (reason: unknown): Effect.Effect<never, UpstreamError> => {
  const error = toUpstreamError(reason);
  return error ? Effect.fail(error) : Effect.die(new UpstreamError({}));
};

const FOUND = { Fail: 'error', Die: 'defect', Interrupt: 'fiberId' } as const;

function find(cause: unknown, tag: keyof typeof FOUND): { found: unknown } | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  if (field(cause, '_tag') === tag) return { found: field(cause, FOUND[tag]) };
  return find(field(cause, 'left'), tag) ?? find(field(cause, 'right'), tag);
}

/**
 * The caller states `A`; the adapter does not check it. A failure next to a
 * defect wins. A defect is an `UpstreamError`, never the upstream object. An
 * interrupt returns after the Effect 3 finalizers finish.
 */
export const fromV3 = <A>(runner: V3Runner, make: () => unknown): Effect.Effect<A, UpstreamError> =>
  Effect.flatMap(
    Effect.callback<unknown>((resume, signal: AbortSignalLike) => {
      // A throw or a rejection is a Die, so it is scrubbed like one.
      const exit = new Promise<unknown>((settle) =>
        settle(runner.runPromiseExit(make() as never, { signal })),
      ).catch((defect: unknown) => ({ _tag: 'Failure', cause: { _tag: 'Die', defect } }));
      void exit.then((value) => resume(Effect.succeed(value)));
      // Runs on interrupt: wait for the Effect 3 finalizers, and keep a defect they raise.
      return Effect.flatMap(
        Effect.promise(() => exit),
        (value): Effect.Effect<void> => {
          const die = find(field(value, 'cause'), 'Die');
          return die ? Effect.die(scrubbed(die.found)) : Effect.void;
        },
      );
    }),
    (exit): Effect.Effect<A, UpstreamError> => {
      if (field(exit, '_tag') === 'Success') return Effect.succeed(field(exit, 'value') as A);
      const cause = field(exit, 'cause');
      const fail = find(cause, 'Fail');
      if (fail) return failed(fail.found);
      const die = find(cause, 'Die');
      if (die) return Effect.die(scrubbed(die.found));
      if (field(exit, '_tag') === 'Failure' && find(cause, 'Interrupt')) return Effect.interrupt;
      return Effect.die(
        new Error('The Effect 3 exit has no value, failure, defect, or interrupt.'),
      );
    },
  );

/**
 * Every rejection becomes an `UpstreamError`, and a reason that cannot be read
 * a defect. Interruption aborts `signal`.
 */
export const fromPromise = <A>(
  run: (signal: AbortSignalLike) => Promise<A>,
): Effect.Effect<A, UpstreamError> =>
  Effect.catch(
    // `tryPromise` passes no signal to a function with no declared parameter.
    Effect.tryPromise({ try: (signal: AbortSignalLike) => run(signal), catch: (reason) => reason }),
    failed,
  );
