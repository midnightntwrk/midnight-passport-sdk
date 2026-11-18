import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMAIN_TAGS } from '@midnight-ntwrk/mn-passport-protocol';

// Wire bytes: a changed tag breaks every signature made with it. A new tag needs a registry row.
test('the domain tags are the registry strings', () => {
  assert.deepEqual(DOMAIN_TAGS, {
    grantRequest: 'midnight:passport:grant:request:v1',
    grantPossession: 'midnight:passport:grant:possession:v1',
    signIn: 'midnight:passport:signin:message:v1',
    recoveryGuardian: 'midnight:account:recovery:guardian:v1',
    recoveryShare: 'midnight:account:recovery:share:v1',
    recoverySubmit: 'midnight:account:recovery:submit:v1',
    recoveryWrap: 'midnight:account:recovery:wrap:v1',
  });
});

test('no two purposes share a tag', () => {
  const tags = Object.values(DOMAIN_TAGS);
  assert.equal(new Set(tags).size, tags.length);
});
