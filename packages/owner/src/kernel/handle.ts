/** An opaque handle to a held secret. It carries no readable bytes. */
export class SecretHandle {
  // A private field stops a plain object from passing as a handle.
  readonly #kernel = true;
}
