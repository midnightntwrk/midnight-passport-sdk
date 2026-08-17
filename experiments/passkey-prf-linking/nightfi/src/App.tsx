import { useState } from 'react';
import { createPassportPasskey, getPrfAssertion, toBase64Url, toHex, RP_ID } from './webauthn';
import { derivePublicKeyHex } from './derive';

interface Outcome {
  credentialId: string;
  prfEnabled: boolean;
  prfEvaluatedAtCreate: boolean | null; // null = sign-in flow, not applicable
  publicKeyHex: string;
  largeBlobSupported: boolean | null;
  accAddressHex: string | null; // the simulated deployed-contract address
  blobWritten: boolean | null;
}

export function App() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(flow: 'onboard' | 'signin') {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      if (flow === 'onboard') {
        const created = await createPassportPasskey('nightfi-demo-user');

        // Simulate provisioning the user's on-chain infrastructure: the
        // "deployed ACC contract address" is 32 random bytes. Attach it to
        // the credential via the largeBlob extension so the Passport app
        // can discover it from the passkey alone.
        const accAddress = crypto.getRandomValues(new Uint8Array(32));
        const written = await getPrfAssertion({
          allowCredentialId: created.credential.rawId,
          writeBlob: accAddress,
        });

        const prfOutput = created.prfAtCreate ?? written.prfOutput;
        if (!prfOutput) throw new Error('PRF extension produced no output (unsupported here)');
        setOutcome({
          credentialId: toBase64Url(created.credential.rawId),
          prfEnabled: created.prfEnabled,
          prfEvaluatedAtCreate: created.prfAtCreate !== null,
          publicKeyHex: derivePublicKeyHex(prfOutput),
          largeBlobSupported: created.largeBlobSupported,
          accAddressHex: toHex(accAddress),
          blobWritten: written.blobWritten,
        });
      } else {
        const asserted = await getPrfAssertion({ readBlob: true });
        if (!asserted.prfOutput) throw new Error('PRF extension produced no output');
        setOutcome({
          credentialId: toBase64Url(asserted.credential.rawId),
          prfEnabled: true,
          prfEvaluatedAtCreate: null,
          publicKeyHex: derivePublicKeyHex(asserted.prfOutput),
          largeBlobSupported: null,
          accAddressHex: asserted.blob ? toHex(asserted.blob) : null,
          blobWritten: null,
        });
      }
    } catch (cause) {
      const err = cause as Error;
      setError(`${err.name}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>
        <span className="brand">NightFi</span> — the partner dApp
      </h1>
      <p>
        Onboards you with a passkey scoped to <code>{RP_ID}</code> (a Related Origin Request —
        this page's origin is <code>{location.origin}</code>), evaluates the PRF extension,
        derives your portable P-256 public key, deploys your (simulated) contract, and attaches
        its address to the passkey via largeBlob.
      </p>
      <div className="actions">
        <button disabled={busy} onClick={() => run('onboard')}>
          Create your Midnight Passport
        </button>
        <button disabled={busy} onClick={() => run('signin')} className="secondary">
          Sign in with an existing passkey
        </button>
      </div>
      {error && (
        <p className="error" data-testid="error">
          {error}
        </p>
      )}
      {outcome && (
        <dl className="result">
          <dt>Credential ID</dt>
          <dd>
            <code data-testid="credential-id">{outcome.credentialId}</code>
          </dd>
          <dt>PRF enabled</dt>
          <dd data-testid="prf-enabled">{String(outcome.prfEnabled)}</dd>
          <dt>PRF evaluated at create()</dt>
          <dd data-testid="prf-at-create">
            {outcome.prfEvaluatedAtCreate === null ? 'n/a (sign-in)' : String(outcome.prfEvaluatedAtCreate)}
          </dd>
          <dt>Derived P-256 public key</dt>
          <dd>
            <code data-testid="pubkey">{outcome.publicKeyHex}</code>
          </dd>
          <dt>largeBlob supported</dt>
          <dd data-testid="largeblob-supported">
            {outcome.largeBlobSupported === null ? 'n/a (sign-in)' : String(outcome.largeBlobSupported)}
          </dd>
          <dt>Deployed contract (ACC) address — 32 random bytes</dt>
          <dd>
            <code data-testid="acc-address">{outcome.accAddressHex ?? 'none'}</code>
          </dd>
          <dt>Address written to the passkey (largeBlob)</dt>
          <dd data-testid="blob-written">
            {outcome.blobWritten === null ? 'n/a' : String(outcome.blobWritten)}
          </dd>
        </dl>
      )}
    </main>
  );
}
