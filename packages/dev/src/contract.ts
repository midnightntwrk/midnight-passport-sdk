import type { AbortSignalLike, PassportError } from '@midnight-ntwrk/mn-passport-core';

/** `run` throws when the implementation breaks the seam contract. It needs no test runner. */
export interface ContractCase {
  readonly name: string;
  run(): Promise<void>;
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const isPassportError = (error: unknown): error is PassportError =>
  error instanceof Error &&
  '_tag' in error &&
  typeof error._tag === 'string' &&
  'code' in error &&
  typeof error.code === 'string';

/** With no `tag`, any `PassportError` passes. */
export async function expectRejection<A>(
  run: () => Promise<A>,
  tag?: string,
): Promise<PassportError> {
  try {
    await run();
  } catch (error) {
    check(isPassportError(error), `expected a PassportError, got ${String(error)}`);
    check(tag === undefined || error._tag === tag, `expected ${String(tag)}, got ${error._tag}`);
    return error;
  }
  throw new Error(`expected a rejection${tag ? ` with ${tag}` : ''}, got a result`);
}

export const abortedSignal = (): AbortSignalLike => ({
  aborted: true,
  addEventListener: () => {},
  removeEventListener: () => {},
});

/**
 * An abort before the call, and an abort while the call is in flight, must each reject with
 * `CancelledError`. `hold` makes the next call stay in flight until the abort.
 */
export async function expectCancel<A>(
  call: (signal: AbortSignalLike) => Promise<A>,
  hold: () => void,
): Promise<void> {
  await expectRejection(() => call(abortedSignal()), 'CancelledError');
  hold();
  const controller = new AbortController();
  const running = call(controller.signal);
  running.catch(() => {});
  // The call must be past its first awaits when the abort comes.
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await expectRejection(() => running, 'CancelledError');
}

/** Each case fails after `guardMs`, so an implementation that hangs fails instead of waiting. */
export const guarded = (cases: readonly ContractCase[], guardMs: number): ContractCase[] =>
  cases.map(({ name, run }) => ({
    name,
    run: () =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no result in ${guardMs} ms`)), guardMs);
        run()
          .then(resolve, reject)
          .finally(() => clearTimeout(timer));
      }),
  }));
