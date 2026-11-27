export interface NodeExpected {
  readonly reason: string;
  readonly action: 'rebuild' | 'stop';
  readonly newProof: boolean;
  readonly nodeCode: number | undefined;
}

const invalid = (data: string) => ({ code: 1010, message: 'Invalid Transaction', data });

// Node answers to `author_submitExtrinsic`, for midnight-node 2.1.101. We infer
// the object shape from the joined text that tests logged,
// `<code>: <message>: <data>`. Core's tests own the code table, so these rows
// test only how the adapter joins the answer.
export const NODE_REFUSALS: readonly (readonly [string, unknown, NodeExpected])[] = [
  [
    '170 DUST spend proof',
    invalid('Custom error: 170'),
    { reason: 'dust-proof-refused', action: 'rebuild', newProof: false, nodeCode: 170 },
  ],
  [
    'the joined text as a string',
    '1010: Invalid Transaction: Custom error: 170',
    { reason: 'dust-proof-refused', action: 'rebuild', newProof: false, nodeCode: 170 },
  ],
  [
    'an object with no number code',
    { code: '1010', message: 'Invalid Transaction: Custom error: 228' },
    { reason: 'expired-intent', action: 'rebuild', newProof: true, nodeCode: 228 },
  ],
  [
    'data that is not a string',
    { code: 1010, message: 'Invalid Transaction', data: { custom: 'Custom error: 104' } },
    { reason: 'transcript-rejected', action: 'rebuild', newProof: true, nodeCode: 104 },
  ],
];

export const ALREADY_IMPORTED = {
  code: 1013,
  message: 'Transaction Already Imported',
  data: 'Any { .. }',
};
