// The browser copy of the Node.js `assert` that a bundle gets. Its users call only `assert(value, message)`.
export default function assert(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? 'Assertion failed');
}
