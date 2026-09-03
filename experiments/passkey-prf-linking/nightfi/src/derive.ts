import { p256 } from '@noble/curves/nist.js';

// The PRF output (32 bytes) is used directly as a P-256 secret scalar; the
// probability of it falling outside the valid scalar range is ~2^-32 of
// 2^-128 territory — noble throws if it ever does, which we surface rather
// than mask. In the real SDK this would derive a Jubjub device key instead
// (requirements §2.3); P-256 is used here to match the proposal's framing.
export function derivePublicKeyHex(prfOutput: Uint8Array): string {
  const publicKey = p256.getPublicKey(prfOutput, true);
  return Array.from(publicKey, (b) => b.toString(16).padStart(2, '0')).join('');
}
