import type { KeyProvider, ProveOptions, Prover } from '@midnight-ntwrk/mn-passport-core';

// The build checks this file, and no test runs it: the build fails if a seam shape drifts.

/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- These checks need a type parameter that appears once. */
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <T extends true>(): T => true as T;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

// A k256 key provider names its envelope, and the others do not.
type K256 = Extract<KeyProvider, { scheme: 'k256' }>;
type Others = Exclude<KeyProvider, { scheme: 'k256' }>;
assertType<Equal<K256['envelope'], 0 | 1>>();
assertType<Equal<Others['scheme'], 'jubjub' | 'p256'>>();
assertType<Equal<'envelope' extends keyof Others ? true : false, false>>();

// Only the transaction, the circuit ids, and the options cross to the prover, which sees them all.
type ProveArgs = Parameters<Prover['prove']>;
assertType<Equal<ProveArgs['length'], 2 | 3>>();
assertType<Equal<ProveArgs[1], readonly string[]>>();
assertType<Equal<keyof ProveOptions, 'signal' | 'timeoutMs'>>();
