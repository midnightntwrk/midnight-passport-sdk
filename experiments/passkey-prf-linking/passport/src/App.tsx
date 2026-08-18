import { useState } from 'react';
import { assertBundled, fromBase64Url, toBase64Url, toHex, RP_ID } from './webauthn';
import { derivePublicKeyHex } from './derive';
import { Guilloche } from './Guilloche';

interface Outcome {
  credentialId: string;
  publicKeyHex: string | null; // null = PRF unsupported by this authenticator
  accAddressHex: string | null; // read back from the passkey's largeBlob
}

// Format a value as a machine-readable-zone line: uppercased, non-alphanumerics
// filled with the filler character `<`, padded/truncated to a fixed width — the
// same treatment a passport's MRZ gives a name or document number.
function mrzLine(value: string, width: number): string {
  const filled = value.toUpperCase().replace(/[^0-9A-Z]/gu, '<');
  return filled.slice(0, width).padEnd(width, '<');
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
      // ONE ceremony, both extensions bundled (see webauthn.ts): derive the
      // key from PRF and read the attached contract address in a single prompt.
      // Discoverable, or allowlisted via the diagnostic input for providers
      // that honour allowlisted assertions but refuse to enumerate.
      logStep(`sign-in: allowlist=${credentialId ? 'explicit credential ID' : 'none (discoverable)'}`);
      const assert = await assertBundled(credentialId ? fromBase64Url(credentialId) : undefined);
      logStep(
        `get(prf.eval + largeBlob.read): ok — prf=${assert.prfOutput ? '32 bytes' : 'DROPPED'}, blob=${assert.blob ? `${assert.blob.length} bytes` : 'none'}`,
      );
      setOutcome({
        credentialId: toBase64Url(assert.credential.rawId),
        publicKeyHex: assert.prfOutput ? derivePublicKeyHex(assert.prfOutput) : null,
        accAddressHex: assert.blob ? toHex(assert.blob) : null,
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

  const mrzData = outcome?.publicKeyHex ?? RP_ID;

  return (
    <div className="uv">
      <Guilloche className="uv__bg" size={640} />
      <main className="doc">
        <header className="doc__masthead">
          <Guilloche className="seal" size={108} />
          <div className="doc__id">
            <p className="eyebrow">Cryptographic identity · verified here</p>
            <h1 className="doc__title">
              MIDNIGHT<span>PASSPORT</span>
            </h1>
          </div>
        </header>

        <dl className="doc__meta">
          <div>
            <dt>Document</dt>
            <dd>Passkey / P-256</dd>
          </div>
          <div>
            <dt>Authority</dt>
            <dd>midnight.network</dd>
          </div>
          <div>
            <dt>RP ID</dt>
            <dd>{RP_ID}</dd>
          </div>
        </dl>

        <p className="lede">
          The border. Authenticates with the same passkey NightFi issued, reads the contract
          address stamped into the credential, and re-derives your key from the PRF — one prompt,
          both extensions bundled. If the key matches, the identity is admitted.
        </p>

        <div className="actions">
          <button
            className="btn btn--primary"
            disabled={busy}
            onClick={() => continueWithPasskey()}
          >
            <span className="btn__key" aria-hidden="true">
              ⧉
            </span>
            Continue with Passkey
          </button>
        </div>

        <details className="drawer">
          <summary>Diagnostic — sign in with an explicit credential ID</summary>
          <p>
            For providers that honour allowlisted assertions but do not enumerate discoverable
            credentials: paste the credential ID shown by NightFi.
          </p>
          <input
            className="field-input"
            value={credentialIdInput}
            onChange={(e) => setCredentialIdInput(e.target.value)}
            placeholder="credential ID (base64url) from nightfi.test"
            data-testid="credential-id-input"
          />
          <div className="actions">
            <button
              className="btn btn--ghost"
              disabled={busy || credentialIdInput.trim().length === 0}
              onClick={() => continueWithPasskey(credentialIdInput.trim())}
            >
              Continue with this credential
            </button>
          </div>
        </details>

        {log.length > 0 && (
          <ol className="ledger" data-testid="steps">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}

        {error && (
          <p className="alert" data-testid="error">
            {error}
          </p>
        )}

        {outcome && (
          <section className="record">
            <div className="record__field">
              <dt>Holder key — P-256, derived from PRF</dt>
              <dd>
                <code
                  data-testid="pubkey"
                  className={outcome.publicKeyHex ? 'is-key' : 'is-empty'}
                >
                  {outcome.publicKeyHex ?? 'no PRF output — unsupported by this authenticator'}
                </code>
              </dd>
            </div>
            <div className="record__field">
              <dt>Attached visa — deployed contract (largeBlob)</dt>
              <dd>
                <code
                  data-testid="acc-address"
                  className={outcome.accAddressHex ? 'is-visa' : 'is-empty'}
                >
                  {outcome.accAddressHex ?? 'no blob attached to this credential'}
                </code>
              </dd>
            </div>
            <div className="record__field">
              <dt>Credential</dt>
              <dd>
                <code data-testid="credential-id">{outcome.credentialId}</code>
              </dd>
            </div>
            <div className="record__field">
              <dt>Cross-origin check — paste the key NightFi derived</dt>
              <dd>
                <div className="compare__row">
                  <input
                    className="field-input"
                    value={compareWith}
                    onChange={(e) => setCompareWith(e.target.value)}
                    placeholder="public key hex from nightfi.test"
                    data-testid="compare-input"
                  />
                  {comparison !== null && (
                    <span
                      className={`stamp ${comparison ? 'stamp--ok' : 'stamp--no'}`}
                      data-testid="compare-verdict"
                    >
                      {comparison ? '✓ Identity linked' : '✗ Keys differ'}
                    </span>
                  )}
                </div>
              </dd>
            </div>
          </section>
        )}

        <footer className="mrz" aria-hidden="true">
          <div>
            P&lt;MPMIDNIGHT&lt;&lt;PASSPORT&lt;&lt;{mrzLine(RP_ID, 24)}
          </div>
          <div>
            <span>KEY</span>
            {mrzLine(mrzData, 44)}
          </div>
        </footer>
      </main>
    </div>
  );
}
