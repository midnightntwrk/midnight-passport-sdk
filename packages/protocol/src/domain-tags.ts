const tags = {
  grantRequest: 'midnight:passport:grant:request:v1',
  grantPossession: 'midnight:passport:grant:possession:v1',
  signIn: 'midnight:passport:signin:message:v1',
  recoveryGuardian: 'midnight:account:recovery:guardian:v1',
  recoveryShare: 'midnight:account:recovery:share:v1',
  recoverySubmit: 'midnight:account:recovery:submit:v1',
  recoveryWrap: 'midnight:account:recovery:wrap:v1',
} as const;

/** A caller length-prefixes or frames a tag before hashing it, so one tag cannot collide with the start of another. */
export const DOMAIN_TAGS: Readonly<typeof tags> = Object.freeze(tags);

export type DomainTag = (typeof DOMAIN_TAGS)[keyof typeof DOMAIN_TAGS];
