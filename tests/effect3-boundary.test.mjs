import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { EFFECT3_EXPORTS } from './effect3-exports.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const ADAPTER_FILES = new Set([
  'packages/core/src/midnight-js.ts',
  'packages/core/test/midnight-js.test.ts',
]);

const MODULE_LISTS = ['builtinModules', 'isBuiltin'];

// The SDK pins only the midnight-js umbrella, so its inner packages are banned too.
const BANNED_SPECIFIERS = [
  /^@effect\//,
  /^@midnight-ntwrk\/(compact-js|platform-js)(\/|$)/,
  /^@midnight-ntwrk\/midnight-js-/,
];

/**
 * Returns one message for each forbidden import in a workspace file.
 * @param {string} path relative to the repo root, with `/` separators
 * @param {string} text
 * @returns {string[]}
 */
function checkSource(path, text) {
  if (ADAPTER_FILES.has(path)) return [];
  /** @type {string[]} */
  const found = [];
  /** @param {string} specifier @param {string[] | 'all'} names */
  const check = (specifier, names) => {
    // A `node:module` loader hides the specifier from this check. Its lists load nothing.
    const loaders = names === 'all' ? ['*'] : names.filter((n) => !MODULE_LISTS.includes(n));
    if (/^(node:)?module$/.test(specifier) && loaders.length > 0) {
      found.push(`${path}: "${specifier}" can load any module; use it only in the adapter file`);
    }
    if (/^effect(\/|$)/.test(specifier) && !path.startsWith('packages/core/')) {
      found.push(`${path}: only core may import "${specifier}"`);
    }
    if (BANNED_SPECIFIERS.some((re) => re.test(specifier))) {
      found.push(`${path}: "${specifier}" is Effect 3; import it only in the adapter file`);
    }
    const banned = EFFECT3_EXPORTS[specifier];
    if (!banned?.length) return;
    if (names === 'all') {
      found.push(`${path}: import named values from "${specifier}", not the whole module`);
      return;
    }
    for (const name of names.filter((n) => banned.includes(n))) {
      found.push(`${path}: "${name}" from "${specifier}" has an Effect 3 type`);
    }
  };
  /** @param {ts.NamedImportBindings | ts.NamedExportBindings | undefined} bindings */
  const namesOf = (bindings) =>
    bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
      ? bindings.elements.map((e) => (e.propertyName ?? e.name).text)
      : 'all';

  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = !clause ? [] : clause.name ? 'all' : namesOf(clause.namedBindings);
      check(node.moduleSpecifier.text, names);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      check(node.moduleSpecifier.text, namesOf(node.exportClause));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      check(node.moduleReference.expression.text, 'all');
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      check(node.argument.literal.text, 'all');
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // Any call can load a module, through any name, so each string argument is checked.
      for (const arg of node.arguments ?? []) {
        if (ts.isStringLiteralLike(arg)) check(arg.text, 'all');
      }
    } else if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isNoSubstitutionTemplateLiteral(node.template)
    ) {
      check(node.template.text, 'all');
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  return found;
}

/** @param {string} dir @returns {string[]} */
const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]s$/.test(entry) ? [path] : [];
  });

test('no workspace file imports Effect 3 outside the adapter file', () => {
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

// Each fixture names the rules that must catch it, so one caught by the wrong rule fails.
const forbidden =
  /** @type {{ label: string, path: string, source: string, found: string[] }[]} */ (
    JSON.parse(
      readFileSync(new URL('fixtures/effect3-boundary/forbidden.json', import.meta.url), 'utf8'),
    )
  );
for (const { label, path, source, found } of forbidden) {
  test(`the boundary test fails on ${label}`, () => {
    assert.deepEqual(
      checkSource(path, source),
      found.map((message) => `${path}: ${message}`),
    );
  });
}

test('the boundary test passes on allowed imports', () => {
  const text = [
    "import { Effect } from 'effect';",
    "import { deployContract } from '@midnight-ntwrk/midnight-js/contracts';",
    "import { MidnightJsError } from '@midnight-ntwrk/midnight-js';",
    "import { builtinModules } from 'node:module';",
  ].join('\n');
  assert.deepEqual(checkSource(outside, text), []);
  assert.deepEqual(
    checkSource(
      'packages/core/src/midnight-js.ts',
      "import * as E from '@midnight-ntwrk/compact-js';",
    ),
    [],
  );
});
