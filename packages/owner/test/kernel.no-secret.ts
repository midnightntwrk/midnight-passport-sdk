import { Kernel, type SecretHandle } from '../dist/kernel/index.js';

/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars -- Each statement exists only for the compiler to reject it. */

const kernel = new Kernel();
const handle: SecretHandle = kernel.holdSecret(new Uint8Array(1));

// @ts-expect-error — a handle must not expose `bytes`.
handle.bytes;
// @ts-expect-error — a handle must not expose `value`.
handle.value;
// @ts-expect-error — a handle must not be indexable.
handle[0];

// @ts-expect-error — holdSecret must not return bytes.
const leaked: Uint8Array = kernel.holdSecret(new Uint8Array(1));
// @ts-expect-error — releaseSecret must not return a secret.
const fromRelease: Uint8Array = kernel.releaseSecret(handle);
