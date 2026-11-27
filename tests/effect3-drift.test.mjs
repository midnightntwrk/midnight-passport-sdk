import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import ts from 'typescript';
import { EFFECT3_EXPORTS } from './effect3-exports.mjs';
import { parseJson } from '../scripts/json.mjs';

// Follows each export's type a few levels, and flags it when a type comes from
// an Effect 3 package, or when a namespace holds such a value.
test('the list of Effect 3 values matches the installed midnight-js', () => {
  const umbrella = dirname(
    createRequire(import.meta.url).resolve('@midnight-ntwrk/midnight-js/package.json'),
  );
  const manifest = /** @type {{ exports: Record<string, { types: string }> }} */ (
    parseJson(readFileSync(join(umbrella, 'package.json'), 'utf8'))
  );
  /** @type {Record<string, string>} */
  const entries = {};
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (subpath === './package.json') continue;
    // A new export shape must fail here, or it could hide new Effect 3 values.
    assert.equal(typeof target?.types, 'string', `cannot read the types of ${subpath}`);
    entries[join('@midnight-ntwrk/midnight-js', subpath).split(sep).join('/')] = join(
      umbrella,
      target.types,
    );
  }
  const program = ts.createProgram(Object.values(entries), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  /** @param {RegExp} re */
  const declaredIn = (re) => (/** @type {ts.Declaration} */ d) =>
    re.test(d.getSourceFile().fileName);
  const inEffect3 = declaredIn(/[\\/]effect@3\.[^\\/]+[\\/]/);
  const inEffect3Library = declaredIn(
    /[\\/]@midnight-ntwrk\+(compact-js|platform-js)@[^\\/]+[\\/]/,
  );

  /** @param {ts.Type} type @param {number} depth @param {Set<ts.Type>} seen @returns {boolean} */
  const reaches = (type, depth, seen) => {
    if (depth < 0 || seen.has(type)) return false;
    seen.add(type);
    if ((type.aliasSymbol ?? type.getSymbol())?.declarations?.some(inEffect3)) return true;
    const next = [...(type.aliasTypeArguments ?? [])];
    if (type.flags & ts.TypeFlags.Object)
      next.push(...checker.getTypeArguments(/** @type {ts.TypeReference} */ (type)));
    if (type.isUnionOrIntersection()) next.push(...type.types);
    for (const s of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
      next.push(s.getReturnType(), ...s.getParameters().map((p) => checker.getTypeOfSymbol(p)));
    }
    if (type.isClassOrInterface()) next.push(...(checker.getBaseTypes(type) ?? []));
    return next.some((t) => reaches(t, depth - 1, seen));
  };
  /** @type {Map<ts.Symbol, boolean>} */
  const memo = new Map();
  /** @param {ts.Symbol} symbol @returns {boolean} */
  const flagged = (symbol) => {
    const s = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (memo.has(s)) return memo.get(s) ?? false;
    memo.set(s, false);
    let result = false;
    if (s.flags & ts.SymbolFlags.ValueModule) {
      result =
        !!s.declarations?.some(inEffect3Library) || checker.getExportsOfModule(s).some(flagged);
    } else if (s.flags & ts.SymbolFlags.Value) {
      result =
        !!s.declarations?.some(inEffect3) || reaches(checker.getTypeOfSymbol(s), 3, new Set());
    }
    memo.set(s, result);
    return result;
  };

  /** @type {Record<string, string[]>} */
  const actual = {};
  for (const [specifier, file] of Object.entries(entries)) {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    assert.ok(module, `cannot read ${file}`);
    const names = checker
      .getExportsOfModule(module)
      .filter(flagged)
      .map((s) => s.name);
    if (names.length) actual[specifier] = names.sort();
  }
  assert.deepEqual(actual, EFFECT3_EXPORTS);
});
