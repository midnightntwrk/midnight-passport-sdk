// Values with an Effect 3 type, on midnight-js 5.0.1. tests/effect3-drift.test.mjs fails when it is out of date.
/** @type {Record<string, string[]>} */
export const EFFECT3_EXPORTS = {
  '@midnight-ntwrk/midnight-js': ['contracts', 'types'],
  '@midnight-ntwrk/midnight-js/contracts': ['Ledger9ContractLog'],
  '@midnight-ntwrk/midnight-js/protocol/v9': ['CompiledContract', 'ContractExecutable'],
  '@midnight-ntwrk/midnight-js/types': [
    'asContractAddress',
    'asEffectOption',
    'exitResultOrError',
    'makeLedger9ContractExecutableRuntime',
  ],
};
