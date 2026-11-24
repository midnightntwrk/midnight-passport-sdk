export {
  ProverConsentDeclinedError,
  ProverConsentRecordError,
  proverDisclosure,
  storeConsentRecord,
  withProverConsent,
  type AcceptedDisclosure,
  type ConsentAnswer,
  type ConsentRecord,
  type ProverConsentOptions,
  type ProverDisclosure,
} from '@midnight-ntwrk/mn-passport-core';
export { accountConsentRecord } from './consent.js';
export {
  PasskeyError,
  createPasskey,
  type CreatedPasskey,
  type Passkey,
  type PasskeyPrf,
  type PasskeyReason,
  type PasskeySite,
} from './passkey.js';
