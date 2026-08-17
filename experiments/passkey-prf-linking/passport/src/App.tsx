import { useState } from 'react';
import { getPrfAssertion, toBase64Url, RP_ID } from './webauthn';
import { derivePublicKeyHex } from './derive';

interface Outcome {
  credentialId: string;
  publicKeyHex: string;
}

export function App() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareWith, setCompareWith] = useState('');

  async function continueWithPasskey() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      // Discoverable credential: no allowCredentials — the authenticator
      // offers whatever passkeys exist for this RP ID, including one created
      // from nightfi.test via the Related Origin Request.
      const asserted = await getPrfAssertion();
      if (!asserted.prfOutput) throw new Error('PRF extension produced no output');
      setOutcome({
        credentialId: toBase64Url(asserted.credential.rawId),
        publicKeyHex: derivePublicKeyHex(asserted.prfOutput),
      });
    } catch (cause) {
      const err = cause as Error;
      setError(`${err.name}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const comparison =
    outcome && compareWith.trim().length > 0
      ? compareWith.trim().toLowerCase() === outcome.publicKeyHex
      : null;

  return (
    <main>
      <h1>
        <span className="brand">Midnight Passport</span> — the identity layer
      </h1>
      <p>
        Authenticates with the same passkey (RP ID <code>{RP_ID}</code>, this page's own origin),
        evaluates the PRF with the same salt, and derives the public key. If the architecture
        holds, it matches the one NightFi derived.
      </p>
      <div className="actions">
        <button disabled={busy} onClick={continueWithPasskey}>
          Continue with Passkey
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
          <dt>Derived P-256 public key</dt>
          <dd>
            <code data-testid="pubkey">{outcome.publicKeyHex}</code>
          </dd>
          <dt>Compare with the key NightFi derived</dt>
          <dd>
            <input
              value={compareWith}
              onChange={(e) => setCompareWith(e.target.value)}
              placeholder="paste the public key hex from nightfi.test"
              data-testid="compare-input"
            />
            {comparison !== null && (
              <p className={comparison ? 'match' : 'error'} data-testid="compare-verdict">
                {comparison ? '✓ same public key — identity linked' : '✗ keys differ'}
              </p>
            )}
          </dd>
        </dl>
      )}
    </main>
  );
}
