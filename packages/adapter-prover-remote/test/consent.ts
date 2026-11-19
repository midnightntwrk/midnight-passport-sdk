import {
  proverDisclosure,
  type AcceptedDisclosure,
  type ProverConsentOptions,
} from '@midnight-ntwrk/mn-passport-core';

/** Consent that accepts, over a fresh in-memory record. */
export function consent(): Omit<ProverConsentOptions, 'prover'> {
  let stored: AcceptedDisclosure | undefined;
  return {
    disclosure: proverDisclosure('Test Prover'),
    ask: async () => 'accepted',
    record: {
      read: async () => stored,
      write: async (accepted) => void (stored = accepted),
    },
  };
}
