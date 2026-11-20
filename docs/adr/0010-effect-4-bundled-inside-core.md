# 0010 — Effect 4 bundled inside `core`, one adapter file for Effect 3

Date: 2026/11/18 · Status: proposed
Refs: midnightntwrk/midnight-passport-sdk#83 · architecture, sections "Design
approach", "Seams", "Adapters", and "Dependency rules"

## Context

The SDK is written with Effect 4. midnight-js 5.0.1, compact-js 3.0.2, and the
wallet SDK use Effect 3. A value of one major cannot run on the other: each
refuses the other's effects, and Effect 3 data types pass some Effect 4 helpers
and fail others with no error.

The docs named no implementation library. They said that reads are observable
and showed Promise signatures, but named no observable type.

A lab test on midnight-js 5.0.0 measured the options:

- With `effect@4` as a plain dependency, npm and bun can install it as the
  top-level `node_modules/effect`. Then npm installs 16 nested copies of
  Effect 3, and bun can crash midnight-js at import. Which copy takes the slot
  depends on the app's dependency list.
- With Effect 4 bundled into the SDK's dist, the tree kept one copy of Effect
  3 under npm, pnpm, and bun. This held when the app did not use Effect 4
  itself.
- A small adapter that treats Effect 3 values as plain objects carried
  success, typed failures, defects, and interruption across the boundary.
- Inferred types that name Effect 3 made the declaration emit fail (TS2883).

## Decision

1. **Effect 4 inside, bundled, exact pin.** `mn-passport-core` uses Effect 4,
   pinned exactly at the root. The build inlines Effect 4 into `core`'s dist.
   `effect` is not in `core`'s `dependencies` or `peerDependencies`.
2. **Only `core` uses Effect 4.** Every other package, the adapters included,
   calls `core` through Effect-free APIs. An adapter implements a
   Promise-typed seam, and `core` wraps each seam call that it makes.
   `contract` returns plain artifacts, and `core` builds the compact-js values
   from them.
3. **One adapter file for Effect 3.** `packages/core/src/midnight-js.ts` and
   its test are the only package source files that import Effect 3 or a
   midnight-js value with an Effect 3 type. The adapter imports nothing from Effect 3 itself. It
   matches `_tag` strings, never `instanceof`, so it works with any physical
   copy of Effect 3.
4. **The public API is Promises and plain types.** No public `.d.ts` names an
   Effect, rxjs, midnight-js, compact-js, platform-js, or wallet SDK type.
   - Every error from `core`, the entry libraries, and the adapters extends
     `PassportError`, a plain class with a literal `_tag` and a stable `code`.
     `contract` and `protocol` cannot import `core`. Their failures carry the
     same two fields, and `core` maps them.
   - When a caller needs a midnight-js interface, such as
     `PrivateStateProvider`, `core` exports an SDK-owned interface that
     matches it.
   - An observable read is a `StateSource<A>` with `current()` and
     `subscribe(listener, onError?)`, which returns an unsubscribe function.
5. **No `/effect` subpath yet.** A bundled `/effect` entry would resolve the
   app's `effect` types, which are Effect 3 in most apps, with no error. It
   waits until midnight-js moves to Effect 4.

Tests enforce items 1 to 4: a boundary test on imports, a guard on the
published `.d.ts` files, and a consumer smoke on npm, pnpm, and bun.

Rejected options:

- **Effect 3 inside the SDK.** It matches midnight-js today. The SDK would
  then move major together with midnight-js, and Effect 3 is the previous
  major.
- **No Effect.** Plain async code must carry interruption, typed errors, and
  resource cleanup by hand at each call.
- **`effect@4` as a dependency or peer dependency.** It can take the app's root
  slot (Context).

## Apps that use Effect 4 themselves

Such an app owns the top-level `node_modules/effect`, whatever the SDK does.
The lab measured:

- **npm:** it works, with 16 extra copies of Effect 3 (52 to 83% more gzip
  JS). A bundler resolver removes them. Do not use Vite's own
  `resolve.dedupe: ['effect']`: it gives Effect 4 to compact-js, and the build
  fails.
- **pnpm:** it works, with one copy of each major.
- **bun:** midnight-js can crash at import. V1 does not support bun with an
  app-owned Effect 4.

The resolver sends each `effect` import that lands in an Effect 3.x copy to one
copy, `EFFECT3_DIR`. We measured this Vite 8 plugin on midnight-js 5.0.0. An
esbuild plugin with the same logic also worked. The consumer guide will carry a
version tested on the release stack.

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dedupeEffect3 = (EFFECT3_DIR) => ({
  name: 'dedupe-effect3',
  enforce: 'pre',
  async resolveId(id, importer, opts) {
    if (!/^effect(\/.*)?$/.test(id) || opts?.custom?.dedupe) return null;
    const r = await this.resolve(id, importer, { ...opts, skipSelf: true, custom: { dedupe: true } });
    const m = r?.id.match(/^(.*[\\/]node_modules[\\/]effect)[\\/](.*)$/);
    if (!m) return r;
    const { version } = JSON.parse(readFileSync(join(m[1], 'package.json'), 'utf8'));
    return version.startsWith('3.') ? join(EFFECT3_DIR, m[2]) : r;
  },
});
```

## Consequences

- `docs/architecture.md` names the implementation library, `StateSource`, and
  how adapters reach midnight-js.
- Each new midnight-js call goes through `fromPromise` or `fromV3` in the
  adapter file. A midnight-js bump checks the boundary test's list of
  Effect-typed exports.
- Effect services, layers, loggers, and tracing do not cross the adapter. The
  Effect 3 side keeps its own runtime and configuration.
- The adapter file converts each Effect 3 `Option`, `Exit`, `Either`, or
  `DateTime` value by its `_tag`, never with an Effect 4 helper.
- Effect 4 adds 9.8 KB gzip to an app bundle with Vite 8, and 31 KB with
  esbuild. The ledger WASM files are 10 MB gzip.
- We ask the midnight-js team to move to Effect 4. When it does, we revisit
  this ADR, and the `/effect` subpath can ship.

### Not tested

- No live wallet, deploy, or proof has run through the adapter, on any version.
- No app with more than one bundled SDK package was installed.
- Two Effect 4 copies (4.1.3 and 4.0.7) ran basic checks only, not services or layers.
- A split build of `core` was not measured, on midnight-js 5.0.0 or 5.0.1.
- Apps that use Effect 4 themselves, and the resolver, were measured on midnight-js 5.0.0 only.
