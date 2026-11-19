/** One deployed ACC build. */
export interface BindingVersion {
  /** The Compact compiler version. */
  readonly compiler: string;
  readonly manifestHash: string;
  /** The WebAuthn origin length in bytes. */
  readonly originLength: number;
}
