import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));

const BANNED = [
  /^effect(\/|$)/,
  /^@effect\//,
  /^rxjs(\/|$)/,
  /^@midnight-ntwrk\/(midnight-js|compact-js|platform-js)/,
  /^@midnightntwrk\/wallet-sdk-/,
  /node_modules/,
];

/** @param {unknown} target @returns {string[]} */
const typesOf = (target) => {
  if (typeof target !== 'object' || target === null) return [];
  return Object.entries(target).flatMap(([key, value]) =>
    key === 'types' && typeof value === 'string' ? [value] : typesOf(value),
  );
};

/**
 * Returns one message for each banned import in the declarations that a
 * package's `exports` reach.
 * @param {string} dir
 * @returns {string[]}
 */
function checkDeclarations(dir) {
  const manifest = /** @type {{ exports?: unknown }} */ (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  );
  const queue = typesOf(manifest.exports).map((t) => join(dir, t));
  if (queue.length === 0) return [`${dir}: no types entry in exports`];
  /** @type {string[]} */
  const found = [];
  const seen = new Set();
  for (let file = queue.shift(); file; file = queue.shift()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const where = relative(root, file);
    if (!existsSync(file)) {
      found.push(`${where}: missing; build first`);
      continue;
    }
    /** @param {ts.Node} node */
    const visit = (node) => {
      /** @type {string | undefined} */
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        specifier = /** @type {ts.StringLiteral} */ (node.moduleSpecifier).text;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        specifier = node.moduleReference.expression.text;
      } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
        specifier = node.name.text;
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      ) {
        specifier = node.argument.literal.text;
      }
      // Banned first: a relative path can still reach into node_modules.
      if (specifier && BANNED.some((re) => re.test(specifier))) {
        found.push(`${where}: a public type imports "${specifier}"`);
      } else if (specifier?.startsWith('.')) {
        queue.push(join(dirname(file), specifier.replace(/\.js$/, '.d.ts')));
      }
      ts.forEachChild(node, visit);
    };
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const ref of source.referencedFiles) queue.push(join(dirname(file), ref.fileName));
    for (const ref of source.typeReferenceDirectives) {
      if (BANNED.some((re) => re.test(ref.fileName))) {
        found.push(`${where}: a public type references "${ref.fileName}"`);
      }
    }
    visit(source);
  }
  return found;
}

test('no published package exposes an Effect, rxjs, midnight-js, or wallet SDK type', () => {
  const packages = readdirSync(join(root, 'packages'))
    .map((pkg) => join(root, 'packages', pkg))
    .filter(
      (dir) =>
        !(
          /** @type {{ private?: boolean }} */ (
            JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
          ).private
        ),
    );
  assert.ok(packages.length > 0);
  assert.deepEqual(packages.flatMap(checkDeclarations), []);
});

test('the guard fails on every other way to reach a banned type', () => {
  const dir = 'tests/fixtures/dts-guard/other-forms';
  // In visit order: the type reference, `import =`, `declare module`, and the
  // relative path into node_modules, then the ImportType in the referenced file.
  assert.deepEqual(checkDeclarations(join(root, dir)), [
    `${dir}/index.d.ts: a public type references "effect"`,
    `${dir}/index.d.ts: a public type imports "effect"`,
    `${dir}/index.d.ts: a public type imports "effect"`,
    `${dir}/index.d.ts: a public type imports "../../../../node_modules/.pnpm/effect@3.22.4/node_modules/effect/dist/dts/Effect.js"`,
    `${dir}/referenced.d.ts: a public type imports "effect"`,
  ]);
});

test('the guard fails on each banned package that a public type imports', () => {
  const found = checkDeclarations(join(root, 'tests/fixtures/dts-guard/leaky'));
  assert.deepEqual(
    found,
    [
      'effect',
      '@effect/platform',
      'rxjs',
      '@midnight-ntwrk/midnight-js/types',
      '@midnightntwrk/wallet-sdk-facade',
    ].map((name) => `tests/fixtures/dts-guard/leaky/inner.d.ts: a public type imports "${name}"`),
  );
});
