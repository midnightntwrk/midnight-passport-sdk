import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'packages/adapter-indexer/';

const CLIENTS =
  /["'](@midnight-ntwrk\/midnight-js-indexer-public-data-provider|@apollo\/client|graphql|graphql-ws|graphql-request|urql)(\/[^"']*)?["']/;
// The indexer's root fields with a GraphQL argument value, and its own input types.
const QUERY =
  /\b(contractActions?|contract|transactions|blocks?)\s*\(\s*(address|offset)\s*:\s*[$"{]|\b(HexEncoded|TransactionOffset|BlockOffset)!?\s*[),]/;

/**
 * Returns one message for each indexer client or query outside the adapter.
 * @param {string} path relative to the repo root, with `/` separators
 * @param {string} text
 * @returns {string[]}
 */
export function checkSource(path, text) {
  if (path.startsWith(OWNER)) return [];
  /** @type {string[]} */
  const found = [];
  const client = CLIENTS.exec(text);
  if (client) found.push(`${path}: imports the indexer client "${client[1] ?? ''}"`);
  if (QUERY.test(text)) found.push(`${path}: builds an indexer query`);
  return found;
}

/** @param {string} dir @returns {string[]} */
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]s$/.test(entry) ? [path] : [];
  });

test('only adapter-indexer imports an indexer client or builds an indexer query', () => {
  const packages = join(root, 'packages');
  const files = readdirSync(packages).flatMap((pkg) =>
    ['src', 'test']
      .map((dir) => join(packages, pkg, dir))
      .filter((dir) => existsSync(dir))
      .flatMap(sourceFiles),
  );
  assert.ok(files.length > 0);
  const found = files.flatMap((file) =>
    checkSource(relative(root, file).split(sep).join('/'), readFileSync(file, 'utf8')),
  );
  assert.deepEqual(found, []);
});

const outside = 'packages/core/src/x.ts';

/** @type {[string, string][]} */
const forbidden = [
  [
    'the midnight-js indexer provider',
    "import { x } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';",
  ],
  ['a GraphQL client', "const ws = await import('graphql-ws');"],
  ['a contract query', 'const q = `query { contract(address: $a) { state } }`;'],
  ['an inline offset', 'const q = `{ transactions(offset: { identifier: "cd" }) { id } }`;'],
  [
    'a transaction query',
    'const q = `query Q($o: TransactionOffset!) { transactions(offset: $o) { id } }`;',
  ],
];
for (const [label, text] of forbidden) {
  test(`the query test fails on ${label}`, () => {
    assert.notDeepEqual(checkSource(outside, text), []);
  });
}

test('the query test passes on the adapter and on plain code', () => {
  assert.deepEqual(
    checkSource('packages/adapter-indexer/src/reads.ts', 'contract(address: $a)'),
    [],
  );
  const plain = [
    'const contract = chain.contract(address);',
    'contract(address: ContractAddress): ContractState | undefined;',
    'return transactions.filter(Boolean);',
  ].join('\n');
  assert.deepEqual(checkSource(outside, plain), []);
});
