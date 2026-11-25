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
