/** The caller checks that `text` is even-length hex. */
export function fromHex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** The lib has no `TextEncoder`. Every string the owner stores or hashes is ASCII. */
export function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (code > 0x7f) throw new RangeError('Not ASCII.');
    return code;
  });
}

export function fromAscii(bytes: Uint8Array): string {
  let text = '';
  // A spread of a long array passes the engine's argument limit.
  for (let i = 0; i < bytes.length; i += 4096) {
    text += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return text;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
