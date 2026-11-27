#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';
import { MANIFEST_PATH, pinOf } from './acc-pin.mjs';
import { parseJson } from './json.mjs';

const OUT_DIR = fileURLToPath(new URL('../packages/core/generated/acc-vectors', import.meta.url));

/**
 * @typedef {'min' | 'max' | 'random'} Mode
 * @typedef {{ x: bigint, y: bigint }} Point
 */

/**
 * `name:kind` in the contract's argument order. Written apart from the SDK table, so that a wrong
 * name or order in either one fails the test. `addr` is raw bytes in the SDK, `hex` a hex string.
 * @type {Record<string, string>}
 */
const OPERATIONS = {
  withdraw_unshielded: 'color:b32 amount:u128 recipient:addr',
  withdraw_shielded: 'recipient:addr color:b32 amount:u128 coin:coin',
  withdraw_shielded_to_contract: 'recipient:hex color:b32 amount:u128 coin:coin',
  append_inbox: 'entry:b192',
  rotate_enc_key: 'key:b32',
  add_device: 'entry:b32',
  remove_device: 'entry:b32',
  issue_grant: 'grantId:b32 scopeDigest:b32',
  revoke_grant: 'grantId:b32',
  revoke_all_grants: '',
  publish_recovery_session:
    'recoveryKey:jub sessionNonce:b32 phi1:field phi2:field phi3:field phi4:field phiLength:u8 wrap:b64',
  recover_cancel: '',
};
// Two random draws, so that fields of the same width hold different values in some vector.
/** @type {Mode[]} */
const MODES = ['min', 'max', 'random', 'random'];

// A fixed seed, so a second run writes the same files.
let counter = 0;
/** @param {number} length */
function randomBytes(length) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 32) {
    const block = createHash('sha256').update(`acc-vectors:${counter++}`).digest();
    out.set(block.subarray(0, Math.min(32, length - i)), i);
  }
  return out;
}
/** @param {bigint} bound */
const randomBelow = (bound) => BigInt(`0x${Buffer.from(randomBytes(40)).toString('hex')}`) % bound;
/** @param {Mode} mode @param {number} length */
const bytesOf = (mode, length) =>
  mode === 'min'
    ? new Uint8Array(length)
    : mode === 'max'
      ? new Uint8Array(length).fill(0xff)
      : randomBytes(length);
/** @param {Mode} mode @param {bigint} bound */
const numberOf = (mode, bound) =>
  mode === 'min' ? 0n : mode === 'max' ? bound - 1n : randomBelow(bound);
/** A key scalar is never 0. @param {Mode} mode @param {bigint} order */
const scalarOf = (mode, order) => numberOf(mode, order - 1n) + 1n;

/** @param {bigint} value */
const be32 = (value) => Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
/** @param {Point} p */
const pointBytes = (p) => new Uint8Array([...be32(p.x), ...be32(p.y)]);

/**
 * Bytes as `0x…` and bigints as `…n`, so the test can revive them.
 * @param {string} _key @param {unknown} value
 */
const replacer = (_key, value) =>
  value instanceof Uint8Array
    ? `0x${Buffer.from(value).toString('hex')}`
    : typeof value === 'bigint'
      ? `${value}n`
      : value;

/** @param {string} dir */
async function generate(dir) {
  const manifestText = readFileSync(MANIFEST_PATH);
  const { files } = /** @type {{ files: Record<string, { sha256: string }> }} */ (
    parseJson(manifestText.toString('utf8'))
  );
  const modulePath = join(dir, 'contract/index.js');
  if (pinOf(readFileSync(modulePath)) !== files['contract/index.js']?.sha256) {
    throw new Error(`${modulePath}: not the pinned module`);
  }
  // The module sits outside the workspace, so its runtime import resolves from here.
  registerHooks({
    resolve: (specifier, context, next) =>
      specifier === '@midnight-ntwrk/compact-runtime'
        ? next(specifier, { ...context, parentURL: import.meta.url })
        : next(specifier, context),
  });
  const rt = await import('@midnight-ntwrk/compact-runtime');
  /** @type {unknown} */
  const contract = await import(pathToFileURL(modulePath).href);
  const { pureCircuits, Contract } =
    /** @type {{ pureCircuits: Record<string, ((...args: unknown[]) => unknown) | undefined>, Contract: new (witnesses: object) => { _webauthn_client_data_hash_chrome_grease_0(...args: unknown[]): unknown } }} */ (
      contract
    );
  // The build exports no pure circuit for the GREASE hash, so the vector calls the contract's own.
  const acc = new Contract({ held_coin: () => undefined });
  /** @param {string} name @param {unknown[]} args */
  const call = (name, ...args) => {
    const circuit = pureCircuits[name];
    if (!circuit) throw new Error(`the artifact has no ${name}`);
    return circuit(...args);
  };
  /** @param {string} arm @param {bigint} scalar */
  const pointOf = (arm, scalar) =>
    /** @type {Point} */ (call(`compute_public_point_with_${arm}`, scalar));

  /** @param {string} kind @param {Mode} mode @returns {[unknown, unknown]} the SDK and runtime values */
  const valueOf = (kind, mode) => {
    if (/^b\d+$/.test(kind)) {
      const value = bytesOf(mode, Number(kind.slice(1)));
      return [value, value];
    }
    if (kind === 'addr' || kind === 'hex') {
      const value = bytesOf(mode, 32);
      return [kind === 'hex' ? Buffer.from(value).toString('hex') : value, { bytes: value }];
    }
    if (kind === 'coin') {
      const [nonce, color] = [bytesOf(mode, 32), bytesOf(mode, 32)];
      const [value, mtIndex] = [numberOf(mode, 1n << 128n), numberOf(mode, 1n << 64n)];
      return [
        { nonce, color, value, mtIndex },
        { nonce, color, value, mt_index: mtIndex },
      ];
    }
    if (kind === 'jub') {
      const p = pointOf('jubjub', scalarOf(mode, rt.JUBJUB_SCALAR_MODULUS));
      return [pointBytes(p), p];
    }
    const bound = kind === 'field' ? rt.FIELD_MODULUS : 1n << BigInt(kind.slice(1));
    const value = numberOf(mode, bound);
    return [value, value];
  };

  const pin = pinOf(manifestText);
  /** @type {Record<string, unknown>} */
  const out = {};
  /** @type {[string, bigint][]} */
  const arms = [
    ['k256', rt.SECP256K1_SCALAR_MODULUS],
    ['p256', rt.SECP256R1_SCALAR_MODULUS],
  ];
  for (const [arm, order] of arms) {
    const vectors = [];
    for (const [operation, spec] of Object.entries(OPERATIONS)) {
      for (const mode of MODES) {
        const pk = pointOf(arm, scalarOf(mode, order));
        const self = bytesOf(mode, 32);
        const authNonce = numberOf(mode, 1n << 64n);
        /** @type {Record<string, unknown>} */
        const args = {};
        /** @type {unknown[]} */
        const rtArgs = [];
        for (const [name = '', kind = ''] of spec
          .split(' ')
          .filter(Boolean)
          .map((p) => p.split(':'))) {
          const [sdkValue, runtimeValue] = valueOf(kind, mode);
          args[name] = sdkValue;
          rtArgs.push(runtimeValue);
        }
        const challenge = call(
          `challenge_${operation}_with_${arm}`,
          { bytes: self },
          pk,
          ...rtArgs,
          authNonce,
        );
        const address = Buffer.from(self).toString('hex');
        vectors.push({
          operation,
          mode,
          address,
          publicKey: pointBytes(pk),
          authNonce,
          args,
          challenge,
        });
      }
    }
    out[`${arm}.json`] = { manifest: pin, arm, vectors };
  }
  const envelope = MODES.flatMap((mode) => {
    const challenge = bytesOf(mode, 32);
    return [0, 1].map((id) => ({
      envelope: id,
      challenge,
      digest: call('envelope_digest', BigInt(id), challenge),
    }));
  });
  out['envelope.json'] = { manifest: pin, vectors: envelope };

  // The circuit refuses an origin byte outside 33 to 126, a quote, or a backslash.
  const originChars = [...Array(94).keys()].map((i) => i + 33).filter((b) => b !== 34 && b !== 92);
  const origins = [
    'https://passport.test',
    String.fromCharCode(...randomBytes(21).map((b) => originChars[b % originChars.length] ?? 33)),
  ];
  const webauthn = [...MODES, 'random', 'random'].flatMap((mode) => {
    const challenge = bytesOf(/** @type {Mode} */ (mode), 32);
    return origins.map((origin) => ({
      challenge,
      origin,
      base64: call('webauthn_challenge_base64', challenge),
      clientDataHash: call('webauthn_client_data_hash', challenge, Buffer.from(origin, 'latin1')),
      greaseHash: acc._webauthn_client_data_hash_chrome_grease_0(
        challenge,
        Buffer.from(origin, 'latin1'),
      ),
    }));
  });
  out['webauthn.json'] = { manifest: pin, vectors: webauthn };

  const keys = arms.flatMap(([arm, order]) =>
    MODES.map((mode) => {
      const scalar = scalarOf(mode, order);
      return {
        arm,
        secretKey: Uint8Array.from(be32(scalar)),
        publicKey: pointBytes(pointOf(arm, scalar)),
      };
    }),
  );
  out['keys.json'] = { manifest: pin, vectors: keys };

  /** @type {Record<string, string>} */
  const texts = {};
  for (const [name, data] of Object.entries(out)) {
    const filepath = join(OUT_DIR, name);
    const options = (await prettier.resolveConfig(filepath)) ?? {};
    texts[name] = await prettier.format(JSON.stringify(data, replacer), { ...options, filepath });
  }
  return texts;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { check: { type: 'boolean' } },
  });
  const [dir] = positionals;
  if (!dir) throw new Error('usage: acc-vectors.mjs <managed-dir> [--check]');
  const texts = await generate(dir);
  if (values.check) {
    const stale = Object.keys(texts).filter(
      (name) => readFileSync(join(OUT_DIR, name), 'utf8') !== texts[name],
    );
    if (stale.length) throw new Error(`stale vectors: ${stale.join(', ')}`);
    console.log('acc-vectors: the checked-in vectors match the artifact');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(texts)) writeFileSync(join(OUT_DIR, name), text);
  console.log(`acc-vectors: wrote ${Object.keys(texts).join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((/** @type {unknown} */ error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
