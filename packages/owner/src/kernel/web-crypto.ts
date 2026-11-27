// The lib is ES2022 only. Node and every browser in a secure context give Web Crypto as a global.
declare const crypto: {
  readonly subtle: {
    digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
    importKey(
      format: 'raw' | 'pkcs8',
      key: Uint8Array,
      algorithm: string | { readonly name: string },
      extractable: boolean,
      usages: readonly string[],
    ): Promise<CryptoKey>;
    exportKey(format: 'raw' | 'pkcs8', key: CryptoKey): Promise<ArrayBuffer>;
    generateKey(
      algorithm: { readonly name: 'X25519' },
      extractable: boolean,
      usages: readonly string[],
    ): Promise<{ readonly privateKey: CryptoKey; readonly publicKey: CryptoKey }>;
    deriveBits(
      algorithm: {
        readonly name: 'HKDF';
        readonly hash: 'SHA-256';
        readonly salt: Uint8Array;
        readonly info: Uint8Array;
      },
      key: CryptoKey,
      length: number,
    ): Promise<ArrayBuffer>;
    encrypt(
      algorithm: {
        readonly name: 'AES-GCM';
        readonly iv: Uint8Array;
        readonly additionalData: Uint8Array;
      },
      key: CryptoKey,
      data: Uint8Array,
    ): Promise<ArrayBuffer>;
    decrypt(
      algorithm: {
        readonly name: 'AES-GCM';
        readonly iv: Uint8Array;
        readonly additionalData: Uint8Array;
      },
      key: CryptoKey,
      data: Uint8Array,
    ): Promise<ArrayBuffer>;
  };
  getRandomValues<T extends Uint8Array>(array: T): T;
};

export interface CryptoKey {
  readonly type: string;
}

import { ascii } from '../bytes.js';

export const subtle: typeof crypto.subtle = crypto.subtle;

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest('SHA-256', bytes));
}

export async function hkdf32(secret: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: ascii(info) },
      key,
      256,
    ),
  );
}
