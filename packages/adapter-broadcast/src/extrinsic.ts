import { toHex } from './request.js';

export type CallIndex = readonly [number, number];

/** Throws `RangeError` unless both parts are bytes. */
export function checkCallIndex(callIndex: CallIndex): CallIndex {
  const bytes =
    callIndex.length === 2 && callIndex.every((p) => Number.isInteger(p) && p >= 0 && p <= 0xff);
  if (!bytes) {
    throw new RangeError('callIndex must be two integers from 0 to 255.');
  }
  return callIndex;
}

// SCALE compact length. The four-byte mode covers every length below 2^30.
function compact(n: number): Uint8Array {
  if (n < 1 << 6) return Uint8Array.of(n << 2);
  if (n < 1 << 14) return Uint8Array.of(((n << 2) | 1) & 0xff, n >> 6);
  if (n < 1 << 30) {
    const v = ((n << 2) | 2) >>> 0;
    return Uint8Array.of(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24);
  }
  throw new RangeError('The transaction is too large for one extrinsic.');
}

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// An unsigned version 4 extrinsic for `send_mn_transaction(Vec<u8>)`. A block
// lists it in this exact form, so the hex also finds it in a block.
export function extrinsicHex(tx: Uint8Array, [pallet, call]: CallIndex): string {
  const body = concat(Uint8Array.of(0x04, pallet, call), compact(tx.length), tx);
  return `0x${toHex(concat(compact(body.length), body))}`;
}
