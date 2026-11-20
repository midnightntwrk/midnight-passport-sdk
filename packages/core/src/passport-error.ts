/** The base of every SDK error. Match on `_tag` or `code`, not on `instanceof`. */
export abstract class PassportError extends Error {
  abstract readonly _tag: string;
  abstract readonly code: string;
}
