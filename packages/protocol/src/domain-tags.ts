const tags = {
  grantRequest: 'midnight:passport:grant:request:v1',
  grantPossession: 'midnight:passport:grant:possession:v1',
  signIn: 'midnight:passport:signin:message:v1',
  recoveryGuardian: 'midnight:account:recovery:guardian:v1',
  recoveryShare: 'midnight:account:recovery:share:v1',
  recoverySubmit: 'midnight:account:recovery:submit:v1',
  recoveryWrap: 'midnight:account:recovery:wrap:v1',
  prfAuthority: 'midnight:passport:prf:authority:v1',
  prfViewing: 'midnight:passport:prf:viewing:v1',
  authorityWrap: 'midnight:passport:authority:wrap:v1',
  viewingWrap: 'midnight:passport:viewing:wrap:v1',
} as const;

/** A caller length-prefixes or frames a tag before hashing it, so one tag cannot collide with the start of another. */
export const DOMAIN_TAGS: Readonly<typeof tags> = Object.freeze(tags);

export type DomainTag = (typeof DOMAIN_TAGS)[keyof typeof DOMAIN_TAGS];

const deviceAuth = {
  jubjub: 'midnight:account:auth:v1:',
  k256: 'midnight:account:auth:k1:v1:',
  p256: 'midnight:account:auth:r1:v1:',
} as const;

/** The account contract appends the operation name, zero-pads the tag to 64 bytes, and hashes it. */
export const DEVICE_AUTH_TAG_PREFIXES: Readonly<typeof deviceAuth> = Object.freeze(deviceAuth);

/** A k256 key on envelope 1 signs SHA-256 of this prefix and the challenge. */
export const K256_CONNECTOR_PREFIX = 'midnight_signed_message:32:';
