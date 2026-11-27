// The caller imports the runtimes after `loadRuntimes()`, because a browser cannot import them before it.

/**
 * @typedef {typeof import('@midnight-ntwrk/compact-runtime')} Runtime
 * @typedef {typeof import('../packages/adapter-nodejs/node_modules/@midnightntwrk/ledger-v9/ledger-v9.js')} Ledger
 * @typedef {import('@midnight-ntwrk/compact-runtime').CircuitContext<object>} CircuitContext
 * @typedef {{
 *   initialState(context: ReturnType<Runtime['createConstructorContext']>): Promise<{
 *     currentContractState: { serialize(): Uint8Array },
 *   }>,
 *   circuits: { increment(context: CircuitContext): Promise<{ context: CircuitContext }> },
 * }} Counter
 * @typedef {{ Contract: new (witnesses: object) => Counter }} Compiled
 */

const COIN = '00'.repeat(32);

/**
 * @param {Runtime} runtime
 * @param {Compiled} compiled
 */
export async function counterState({ createConstructorContext }, { Contract }) {
  const initial = await new Contract({}).initialState(createConstructorContext({}, COIN));
  return initial.currentContractState.serialize();
}

/**
 * @param {import('../packages/core/dist/index.js').Platform} platform
 * @param {string} stateUrl
 * @param {{ runtime: Runtime, ledger: Ledger, compiled: Compiled }} modules
 */
export async function smoke(platform, stateUrl, { runtime, ledger, compiled }) {
  const { status, body } = await platform.http({ url: stateUrl, method: 'GET' });
  if (status !== 200) throw new Error(`the state server answered ${status}`);
  const state = ledger.ContractState.deserialize(body);
  if (!state.operations().includes('increment')) throw new Error('the state has no increment');

  const address = ledger.sampleContractAddress();
  const context = runtime.createCircuitContext({
    circuitId: 'increment',
    contractAddress: address,
    coinPublicKeyOrZswapState: COIN,
    contractState: runtime.ContractState.deserialize(body).data,
    privateState: {},
  });
  const contract = new compiled.Contract({});
  const proofData = (await contract.circuits.increment(context)).context.callProofDataTrace.at(-1);
  const operation = state.operation('increment');
  if (!proofData || !operation) throw new Error('the circuit gave no proof data');
  const pre = new ledger.PreTranscript(
    new ledger.QueryContext(state.data, address),
    proofData.publicTranscript,
  );
  const [parts] = ledger.partitionTranscripts([pre], ledger.LedgerParameters.initialParameters());
  if (!parts) throw new Error('the transcript did not partition');
  const [guaranteed, fallible] = parts;
  const call = new ledger.ContractCallPrototype(
    address,
    'increment',
    operation,
    guaranteed,
    fallible,
    proofData.privateTranscriptOutputs,
    proofData.input,
    proofData.output,
    ledger.communicationCommitmentRandomness(),
    'increment',
  );
  const intent = ledger.Intent.new(new Date(Date.now() + 600_000)).addCall(call);
  const bytes = ledger.Transaction.fromParts(
    'undeployed',
    undefined,
    undefined,
    intent,
  ).serialize();
  const back = ledger.Transaction.deserialize('signature', 'pre-proof', 'pre-binding', bytes);
  return { bytes: bytes.length, intents: back.intents?.size ?? 0 };
}
