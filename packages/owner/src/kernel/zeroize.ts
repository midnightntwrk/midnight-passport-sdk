export function zeroize(buffer: Uint8Array): void {
  buffer.fill(0);
}

export function withSecret<T>(secret: Uint8Array, use: (secret: Uint8Array) => T): T {
  try {
    return use(secret);
  } finally {
    zeroize(secret);
  }
}

export async function withSecretAsync<T>(
  secret: Uint8Array,
  use: (secret: Uint8Array) => Promise<T>,
): Promise<T> {
  try {
    return await use(secret);
  } finally {
    zeroize(secret);
  }
}
