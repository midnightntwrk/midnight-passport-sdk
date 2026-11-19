export interface ProtocolVersion {
  readonly major: number;
  readonly minor: number;
}

export const PROTOCOL_VERSION: ProtocolVersion = Object.freeze({ major: 2, minor: 0 });

export type ProtocolVersionCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'higher-major' };

/** Refuses only a higher major. */
export function checkProtocolVersion(
  peer: ProtocolVersion,
  ours: ProtocolVersion = PROTOCOL_VERSION,
): ProtocolVersionCheck {
  if (peer.major > ours.major) {
    return { ok: false, reason: 'higher-major' };
  }
  return { ok: true };
}
