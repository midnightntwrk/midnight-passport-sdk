import type { AccGroup } from './deployed.js';

// `contract` cannot import `core`. These errors copy the `_tag` and `code` fields of `PassportError`, and `core` maps them.

/** The raw manifest bytes do not hash to the pin. */
export class ArtifactPinError extends Error {
  readonly _tag = 'ArtifactPinError';
  readonly code = 'ARTIFACT_PIN';
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`The ACC manifest hash ${actual} is not the pinned ${expected}.`);
  }
}

export class ArtifactManifestError extends Error {
  readonly _tag = 'ArtifactManifestError';
  readonly code = 'ARTIFACT_MANIFEST';
  /** `field` is the first field that does not have the expected shape. */
  constructor(readonly field: string) {
    super(`The ACC manifest field "${field}" does not have the expected shape.`);
  }
}

export class ArtifactIntegrityError extends Error {
  readonly _tag = 'ArtifactIntegrityError';
  readonly code = 'ARTIFACT_INTEGRITY';
  constructor(
    readonly file: string,
    readonly reason: 'hash' | 'unlisted' | 'proving-key',
  ) {
    super(`The ACC artifact file "${file}" is refused (${reason}).`);
  }
}

/** `arm` is `undefined` when the build has no such circuit. */
export class CircuitNotDeployedError extends Error {
  readonly _tag = 'CircuitNotDeployedError';
  readonly code = 'CIRCUIT_NOT_DEPLOYED';
  constructor(
    readonly circuit: string,
    readonly arm: AccGroup | undefined,
  ) {
    super(`The account has no circuit "${circuit}"${arm ? ` (arm ${arm})` : ''}.`);
  }
}

export class VerifierKeyMismatchError extends Error {
  readonly _tag = 'VerifierKeyMismatchError';
  readonly code = 'VERIFIER_KEY_MISMATCH';
  constructor(readonly circuit: string) {
    super(`The on-chain verifier key of "${circuit}" is not the pinned one.`);
  }
}

/** The bytes are not a serialized ledger contract state. */
export class AccountStateError extends Error {
  readonly _tag = 'AccountStateError';
  readonly code = 'ACCOUNT_STATE';
  constructor(options?: { readonly cause: unknown }) {
    super('The account state bytes cannot be read.', options);
  }
}
