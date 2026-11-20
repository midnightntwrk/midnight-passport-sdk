const HEX = /^(?:[0-9a-fA-F]{2})+$/;

/** `undefined` unless `value` is even-length hex with no `0x`. */
export function decodeHex(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string' || !HEX.test(value)) return undefined;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}
