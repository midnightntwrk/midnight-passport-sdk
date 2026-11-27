const HEX = /^(?:[0-9a-fA-F]{2})*$/;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** `undefined` unless `text` is even-length hex with no `0x`. */
export function fromHex(text: string): Uint8Array | undefined {
  if (!HEX.test(text)) return undefined;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}
