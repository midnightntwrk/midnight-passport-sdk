import { UnknownHandleError } from './errors.js';
import { SecretHandle } from './handle.js';
import { zeroize } from './zeroize.js';

/**
 * The only object that holds an account's secrets in plaintext. Create one
 * per account.
 */
export class Kernel {
  // Keep no other reference to these copies.
  readonly #retained = new Map<SecretHandle, Uint8Array>();

  /**
   * Zeros the caller's buffer. The kept copy lives until `releaseSecret` or
   * `dispose`.
   */
  holdSecret(bytes: Uint8Array): SecretHandle {
    const handle = new SecretHandle();
    // `slice` on a Node.js `Buffer` shares memory; this constructor always copies.
    this.#retained.set(handle, new Uint8Array(bytes));
    zeroize(bytes);
    return handle;
  }

  /** Zeros the copy for `handle`. A later call with the same handle throws. */
  releaseSecret(handle: SecretHandle): void {
    const copy = this.#retained.get(handle);
    if (copy === undefined) {
      throw new UnknownHandleError();
    }
    zeroize(copy);
    this.#retained.delete(handle);
  }

  /** Zeros every copy the kernel holds. */
  dispose(): void {
    for (const copy of this.#retained.values()) zeroize(copy);
    this.#retained.clear();
  }
}
