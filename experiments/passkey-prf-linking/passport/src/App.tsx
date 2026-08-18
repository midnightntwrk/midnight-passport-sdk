import { useState } from 'react';
import { evalPrf, fromBase64Url, readBlob, toBase64Url, toHex, RP_ID } from './webauthn';
import { derivePublicKeyHex } from './derive';

interface Outcome {
  credentialId: string;
  publicKeyHex: string | null; // null = PRF unsupported by this authenticator
  accAddressHex: string | null; // read back from the passkey's largeBlob
}

export function App() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareWith, setCompareWith] = useState('');
  const [credentialIdInput, setCredentialIdInput] = useState('');
  const [log, setLog] = useState<string[]>([]);

  function logStep(line: string) {
    setLog((previous) => [...previous, line]);
  }

  async function continueWithPasskey(credentialId?: string) {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setLog([]);
    try {
      // Two ceremonies, one extension each (see webauthn.ts). The first is
      // discoverable (or allowlisted via the diagnostic input, for providers
      // that honour allowlisted assertions but refuse to enumerate); the
      // second reuses the first's credential, so no second picker. Each is
      // tolerated independently so a failing extension still yields data.
      logStep(`sign-in: allowlist=${credentialId ? 'explicit credential ID' : 'none (discoverable)'}`);
      const read = await readBlob(credentialId ? fromBase64Url(credentialId) : undefined);
      logStep(`get(largeBlob.read): ok — blob=${read.blob ? `${read.blob.length} bytes` : 'none'}`);
      let publicKeyHex: string | null = null;
      try {
        const prf = await evalPrf(read.credential.rawId);
        publicKeyHex = prf.prfOutput ? derivePublicKeyHex(prf.prfOutput) : null;
        logStep(`get(prf.eval): ok — output=${prf.prfOutput ? '32 bytes' : 'none'}`);
      } catch (cause) {
        const err = cause as Error;
        logStep(`get(prf.eval): FAILED — ${err.name}: ${err.message}`);
      }
      setOutcome({
        credentialId: toBase64Url(read.credential.rawId),
        publicKeyHex,
        accAddressHex: read.blob ? toHex(read.blob) : null,
      });
    } catch (cause) {
      const err = cause as Error;
      setError(`${err.name}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const comparison =
    outcome && outcome.publicKeyHex && compareWith.trim().length > 0
      ? compareWith.trim().toLowerCase() === outcome.publicKeyHex
      : null;

  return (
    <main>
      <h1>
        <span className="brand">Midnight Passport</span> — the identity layer
      </h1>
      <p>
        Authenticates with the same passkey (RP ID <code>{RP_ID}</code>, this page's own origin),
        reads the attached information NightFi stored on the credential — the deployed contract
        address — and evaluates the PRF with the same salt to derive the public key. Two
        prompts: one extension per ceremony.
      </p>
      <div className="actions">
        <button disabled={busy} onClick={() => continueWithPasskey()}>
          Continue with Passkey
        </button>
      </div>
      <details>
        <summary>Diagnostic: sign in with an explicit credential ID</summary>
        <p>
          For providers that honour allowlisted assertions but do not enumerate discoverable
          credentials: paste the credential ID shown by NightFi.
        </p>
        <input
          value={credentialIdInput}
          onChange={(e) => setCredentialIdInput(e.target.value)}
          placeholder="credential ID (base64url) from nightfi.test"
          data-testid="credential-id-input"
        />
        <div className="actions">
          <button
            disabled={busy || credentialIdInput.trim().length === 0}
            onClick={() => continueWithPasskey(credentialIdInput.trim())}
            className="secondary"
          >
            Continue with this credential
          </button>
        </div>
      </details>
      {log.length > 0 && (
        <ol className="steps" data-testid="steps">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
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
          <dt>Attached information (largeBlob) — your deployed contract</dt>
          <dd>
            <code data-testid="acc-address">
              {outcome.accAddressHex ?? 'no blob attached to this credential'}
            </code>
          </dd>
          <dt>Derived P-256 public key</dt>
          <dd>
            <code data-testid="pubkey">
              {outcome.publicKeyHex ?? 'no PRF output — unsupported by this authenticator'}
            </code>
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
