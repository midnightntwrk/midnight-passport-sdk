import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION, checkProtocolVersion } from '@midnight-ntwrk/mn-passport-protocol';

test('PROTOCOL_VERSION is the wire version this build speaks', () => {
  assert.deepEqual(PROTOCOL_VERSION, { major: 2, minor: 0 });
});

test('PROTOCOL_VERSION is frozen: a field write throws', () => {
  assert.ok(Object.isFrozen(PROTOCOL_VERSION));
  assert.throws(() => {
    (PROTOCOL_VERSION as { major: number }).major = 9;
  }, TypeError);
});

test('checkProtocolVersion accepts an equal version', () => {
  assert.deepEqual(checkProtocolVersion({ major: 2, minor: 3 }, { major: 2, minor: 3 }), {
    ok: true,
  });
});

test('checkProtocolVersion accepts a lower minor', () => {
  assert.deepEqual(checkProtocolVersion({ major: 2, minor: 1 }, { major: 2, minor: 3 }), {
    ok: true,
  });
});

test('checkProtocolVersion refuses a higher major', () => {
  assert.deepEqual(checkProtocolVersion({ major: 3, minor: 0 }, { major: 2, minor: 3 }), {
    ok: false,
    reason: 'higher-major',
  });
});

test('checkProtocolVersion compares against this build by default', () => {
  assert.deepEqual(checkProtocolVersion({ major: 2, minor: 0 }), { ok: true });
  assert.deepEqual(checkProtocolVersion({ major: 3, minor: 0 }), {
    ok: false,
    reason: 'higher-major',
  });
});
