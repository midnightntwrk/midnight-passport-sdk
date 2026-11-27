export function zeroize(buffer: Uint8Array): void {
  buffer.fill(0);
}

/** For an async `use`, zeros the secret when its Promise settles. */
export function withSecret<T>(
  secret: Uint8Array,
  use: (secret: Uint8Array) => Promise<T>,
): Promise<T>;
export function withSecret<T>(secret: Uint8Array, use: (secret: Uint8Array) => T): T;
export function withSecret<T>(
  secret: Uint8Array,
  use: (secret: Uint8Array) => T | Promise<T>,
): T | Promise<T> {
  let result: T | Promise<T>;
  try {
    result = use(secret);
  } catch (error) {
    zeroize(secret);
    throw error;
  }
  if (result instanceof Promise) return result.finally(() => zeroize(secret));
  zeroize(secret);
  return result;
}
