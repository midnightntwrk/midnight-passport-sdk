import { useState } from 'react';
import { createPassportPasskey, getPrfAssertion, toBase64Url, RP_ID } from './webauthn';
import { derivePublicKeyHex } from './derive';

interface Outcome {
  credentialId: string;
  prfEnabled: boolean;
  prfEvaluatedAtCreate: boolean | null; // null = sign-in flow, not applicable
  publicKeyHex: string;
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
        let prfOutput = created.prfAtCreate;
        let evaluatedAtCreate = prfOutput !== null;
        if (!prfOutput) {
          // PRF not evaluated at create — evaluate it with an immediate
          // assertion against the credential we just made.
          const asserted = await getPrfAssertion(created.credential.rawId);
          prfOutput = asserted.prfOutput;
        }
        if (!prfOutput) throw new Error('PRF extension produced no output (unsupported here)');
        setOutcome({
          credentialId: toBase64Url(created.credential.rawId),
          prfEnabled: created.prfEnabled,
          prfEvaluatedAtCreate: evaluatedAtCreate,
          publicKeyHex: derivePublicKeyHex(prfOutput),
        });
      } else {
        const asserted = await getPrfAssertion();
        if (!asserted.prfOutput) throw new Error('PRF extension produced no output');
        setOutcome({
          credentialId: toBase64Url(asserted.credential.rawId),
          prfEnabled: true,
          prfEvaluatedAtCreate: null,
          publicKeyHex: derivePublicKeyHex(asserted.prfOutput),
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
        this page's origin is <code>{location.origin}</code>), evaluates the PRF extension, and
        derives your portable P-256 public key.
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
        </dl>
      )}
    </main>
  );
}
