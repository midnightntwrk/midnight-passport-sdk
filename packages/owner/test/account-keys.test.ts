import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createPrivateKey, createPublicKey, hkdfSync } from 'node:crypto';
import * as ledger from '@midnightntwrk/ledger-v9';
import {
  AuthorityKey,
  createViewingKey,
  openViewingKey,
  prfInputs,
  takePrf,
} from '../dist/kernel/account-keys.js';

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');
const prf = (seed: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => i + seed);

// Computed with Python's hashlib, not with this code.
test('the PRF inputs match an independent SHA-256', async () => {
  const inputs = await prfInputs();
  assert.equal(
    hex(inputs.first),
    'e05456bae0f8dda3bed99b162f9ad997f67d94d57aaa2674d748e533ba2120b4',
  );
  assert.equal(
    hex(inputs.second),
    'e89bfe94ccc843063315962a9d95df63cf88b1989cce7b6461982a610dc7b25c',
  );
});

// A stored wrap must stay readable, so its format is checked with node:crypto.
test('the authority wrap is AES-256-GCM under an HKDF key, and a zero scalar is drawn again', async () => {
  const secret = new Uint8Array(32).fill(7);
  const draws = [new Uint8Array(32), secret.slice()];
  const { key, wrapped } = await AuthorityKey.create(
    ledger,
    prf(0),
    () => draws.shift() ?? assert.fail('a third draw'),
  );
  assert.equal(
    key.verifyingKey.value,
    ledger.signatureVerifyingKey({ tag: 'schnorr', value: hex(secret) }).value,
  );
  const wrap = Buffer.from(wrapped.wrap);
  assert.equal(wrap[0], 1);
  const aes = hkdfSync(
    'sha256',
    prf(0),
    new Uint8Array(0),
    'midnight:passport:authority:wrap:v1',
    32,
  );
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(aes), wrap.subarray(1, 13));
  decipher.setAAD(wrapped.publicKey);
  decipher.setAuthTag(wrap.subarray(-16));
  assert.equal(
    hex(Buffer.concat([decipher.update(wrap.subarray(13, -16)), decipher.final()])),
    hex(secret),
  );
});

test('an authority key is new for each account, and its wrap opens only with its PRF output and public key', async () => {
  const input = prf(0);
  const { key, wrapped } = await AuthorityKey.create(ledger, input);
  assert.ok(input.every((b) => b === 0));
  const data = Uint8Array.of(1, 2, 3);
  assert.ok(ledger.verifySignature(key.verifyingKey, data, key.sign(data)));
  key.requireCommittee([key.verifyingKey]);

  const opened = await AuthorityKey.open(ledger, prf(0), wrapped);
  assert.equal(opened?.verifyingKey.value, key.verifyingKey.value);
  assert.equal(await AuthorityKey.open(ledger, prf(1), wrapped), undefined);

  const other = await AuthorityKey.create(ledger, prf(0));
  assert.notEqual(other.key.verifyingKey.value, key.verifyingKey.value);
  assert.throws(() => other.key.requireCommittee([key.verifyingKey]), {
    code: 'AUTHORITY_KEY_MISMATCH',
  });
  const moved = { ...wrapped, publicKey: other.wrapped.publicKey };
  assert.equal(await AuthorityKey.open(ledger, prf(0), moved), undefined);
  key.dispose();
  assert.throws(() => key.sign(data));
});

test('a PRF result without user verification or without an output is refused', () => {
  assert.throws(() => takePrf({ first: prf(0), userVerified: false }, 'first'), {
    code: 'PRF_UNAVAILABLE',
  });
  assert.throws(() => takePrf({ first: prf(0), userVerified: true }, 'second'), {
    code: 'PRF_UNAVAILABLE',
  });
});

test('the viewing wrap opens only with its PRF output and its public key', async () => {
  let held: Uint8Array | undefined;
  const key = await createViewingKey(prf(0), (secret) => {
    held = secret.slice();
  });
  assert.ok(held);
  // The held bytes are the private half of the constructor's public key.
  const der = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), held]);
  const pub = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }));
  assert.equal(hex(pub.export({ format: 'der', type: 'spki' }).subarray(-32)), hex(key.publicKey));

  assert.deepEqual(await openViewingKey(prf(0), key), held);
  assert.equal(await openViewingKey(prf(1), key), undefined);
  const otherPublic = { ...key, publicKey: new Uint8Array(32) };
  assert.equal(await openViewingKey(prf(0), otherPublic), undefined);
});
