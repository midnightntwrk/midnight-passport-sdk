import type { ProverDisclosure } from './prover-consent.js';

/** Draft, for product owner review. A blank `operator` throws `TypeError`. */
export function proverDisclosure(operator: string): ProverDisclosure {
  const name = operator.trim();
  if (name === '') throw new TypeError('The operator name is empty.');
  return {
    version: '1-draft',
    operator: name,
    short:
      `${name} makes the proofs for your account. To do this, it sees the private ` +
      'details of each action, for example the coin and the amount. It never gets ' +
      'your passkey or your account keys.',
    long: [
      'Each action on your account needs a zero-knowledge proof. This version does ' +
        `not make the proof on your device. A proving service run by ${name} makes it.`,
      'For an action of your account, the service sees the private inputs of the ' +
        'proof. Examples are the coin, the amount, and the data of the coins that ' +
        'the action spends or receives.',
      'When an app that you connected acts on your account, the service makes the ' +
        'proofs for that app too. It then sees the data that the app puts into the ' +
        'proof. This data can include other private information about you.',
      'The service never gets your passkey or the keys of your account. Thus, it ' +
        'cannot sign for your account. The proof of an app can hold secrets of that app.',
      'When a proving service in trusted hardware exists, the inputs will be encrypted to it.',
      'When this text changes, we ask you again.',
    ].join('\n\n'),
  };
}
