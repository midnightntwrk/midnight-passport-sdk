// JSON.parse returns unknown here, so each caller states the type it reads.
interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
}
