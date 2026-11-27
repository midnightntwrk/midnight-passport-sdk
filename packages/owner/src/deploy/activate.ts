import type { AccArtifact } from '@midnight-ntwrk/mn-passport-contract';
import type { CallInputs } from '@midnight-ntwrk/mn-passport-core';
import { fromHex } from '../bytes.js';
import { contractPoint, contractPolicy } from './birth.js';
import type { BirthRecord } from './record.js';

export interface ActivationOptions {
  readonly artifact: AccArtifact;
  /** The `Contract` class of the ACC module that `artifact` pins. */
  readonly contract: new (witnesses: never) => object;
  readonly networkId: string;
}

/**
 * Builds the unproven activation of the record's passkey. On this pin it needs
 * no prompt: only the committed key can activate.
 */
// TODO: use the temporary JubJub bootstrap when the contract has it.
export function activationCall(
  options: ActivationOptions,
): (record: BirthRecord, inputs: CallInputs, ttlSeconds: number) => Promise<Uint8Array> {
  return async (record, inputs, ttlSeconds) => {
    if (record.salt === undefined) throw new RangeError('The record has no boot salt left.');
    // midnight-js loads only when a page activates, not with the entry of the app.
    const { buildAccCall } = await import('@midnight-ntwrk/mn-passport-core/chain');
    return buildAccCall({
      artifact: options.artifact,
      contract: options.contract,
      witnesses: {
        held_coin: () => {
          throw new Error('Activation reads no coin.');
        },
      },
      state: inputs.state,
      ledgerParameters: inputs.ledgerParameters,
      zswapChainState: inputs.zswapChainState,
      circuit: 'activate_initial_device_with_p256',
      args: [
        contractPoint(fromHex(record.passkey.publicKey)),
        fromHex(record.salt),
        contractPolicy({
          rpIdHash: fromHex(record.passkey.rpIdHash),
          origin: record.passkey.origin,
        }),
      ],
      // Activation moves no shielded coin, so any well-formed keys do.
      coinPublicKey: '00'.repeat(32),
      encryptionPublicKey: '00'.repeat(32),
      networkId: options.networkId,
      ttlSeconds,
    });
  };
}
