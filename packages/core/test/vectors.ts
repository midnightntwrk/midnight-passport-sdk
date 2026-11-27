import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACC_MANIFEST_SHA256 } from '@midnight-ntwrk/mn-passport-contract';

const revive = (_key: string, value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (value.startsWith('0x')) return Uint8Array.from(Buffer.from(value.slice(2), 'hex'));
  if (/^\d+n$/.test(value)) return BigInt(value.slice(0, -1));
  return value;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The JSON is untyped. The builders check each value at run time, so the tests call them untyped. */
export function loadVectors(name: string): Record<string, unknown>[] {
  const url = new URL(`../generated/acc-vectors/${name}`, import.meta.url);
  const file: unknown = JSON.parse(readFileSync(url, 'utf8'), revive);
  assert.ok(isRecord(file) && Array.isArray(file.vectors) && file.vectors.every(isRecord));
  assert.equal(file.manifest, ACC_MANIFEST_SHA256, 'run `pnpm vectors <managed-dir>` again');
  return file.vectors;
}

export const hex = (bytes: unknown): string => {
  assert.ok(bytes instanceof Uint8Array);
  return Buffer.from(bytes).toString('hex');
};
