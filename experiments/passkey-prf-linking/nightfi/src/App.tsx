import { useState } from 'react';
import {
  createPassportPasskey,
  evalPrf,
  fromBase64Url,
  readBlob,
  toBase64Url,
  toHex,
  writeBlob,
  RP_ID,
} from './webauthn';
import { derivePublicKeyHex } from './derive';

// Some providers do not enumerate discoverable credentials for a related
// origin (the picker flashes and closes), even though allowlisted
// assertions work. A real partner dApp would remember its credential ID
// from onboarding — mirrored here with localStorage.
const CREDENTIAL_ID_KEY = 'nightfi.credentialId';

interface Outcome {
  credentialId: string;
  prfEnabled: boolean | null; // null = sign-in flow (enablement is a create() datum)
  publicKeyHex: string | null; // null = PRF unsupported by this authenticator
  largeBlobSupported: boolean | null;
  accAddressHex: string | null; // the simulated deployed-contract address
  blobWritten: boolean | null;
}

export function App() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function logStep(line: string) {
    setLog((previous) => [...previous, line]);
  }

  async function run(flow: 'onboard' | 'signin') {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setLog([]);
    try {
      if (flow === 'onboard') {
        // Three ceremonies, one extension each (see webauthn.ts). Each is
        // tolerated independently so a failing extension still yields a
        // full support-matrix row.
        const created = await createPassportPasskey('nightfi-demo-user');
        localStorage.setItem(CREDENTIAL_ID_KEY, toBase64Url(created.credential.rawId));
        logStep(
          `create(): ok — prfEnabled=${created.prfEnabled}, largeBlobSupported=${created.largeBlobSupported}`,
        );

        let publicKeyHex: string | null = null;
        try {
          const prf = await evalPrf(created.credential.rawId);
          publicKeyHex = prf.prfOutput ? derivePublicKeyHex(prf.prfOutput) : null;
          logStep(`get(prf.eval): ok — output=${prf.prfOutput ? '32 bytes' : 'none'}`);
        } catch (cause) {
          const err = cause as Error;
          logStep(`get(prf.eval): FAILED — ${err.name}: ${err.message}`);
        }

        // Simulate provisioning the user's on-chain infrastructure: the
        // "deployed ACC contract address" is 32 random bytes, attached to
        // the credential via largeBlob so the Passport app can discover it
        // from the passkey alone.
        const accAddress = crypto.getRandomValues(new Uint8Array(32));
        let blobWritten: boolean | null = null;
        try {
          const written = await writeBlob(created.credential.rawId, accAddress);
          blobWritten = written.written;
          logStep(`get(largeBlob.write): ok — written=${written.written}`);
        } catch (cause) {
          const err = cause as Error;
          logStep(`get(largeBlob.write): FAILED — ${err.name}: ${err.message}`);
        }

        setOutcome({
          credentialId: toBase64Url(created.credential.rawId),
          prfEnabled: created.prfEnabled,
          publicKeyHex,
          largeBlobSupported: created.largeBlobSupported,
          accAddressHex: toHex(accAddress),
          blobWritten,
        });
      } else {
        // Prefer the credential ID remembered from onboarding (allowlisted
        // assertions work under ROR even where discoverable enumeration
        // does not); fall back to the discoverable flow without one.
        const storedId = localStorage.getItem(CREDENTIAL_ID_KEY);
        logStep(`sign-in: allowlist=${storedId ? 'stored credential ID' : 'none (discoverable)'}`);
        const prf = await evalPrf(storedId ? fromBase64Url(storedId) : undefined);
        logStep(`get(prf.eval): ok — output=${prf.prfOutput ? '32 bytes' : 'none'}`);
        let accAddressHex: string | null = null;
        try {
          // Second ceremony allowlisted from the first's credential.
          const read = await readBlob(prf.credential.rawId);
          accAddressHex = read.blob ? toHex(read.blob) : null;
          logStep(`get(largeBlob.read): ok — blob=${read.blob ? `${read.blob.length} bytes` : 'none'}`);
        } catch (cause) {
          const err = cause as Error;
          logStep(`get(largeBlob.read): FAILED — ${err.name}: ${err.message}`);
        }
        setOutcome({
          credentialId: toBase64Url(prf.credential.rawId),
          prfEnabled: null,
          publicKeyHex: prf.prfOutput ? derivePublicKeyHex(prf.prfOutput) : null,
          largeBlobSupported: null,
          accAddressHex,
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
        its address to the passkey via largeBlob. Each extension runs in its own ceremony, so
        expect up to three prompts.
      </p>
      <div className="actions">
        <button disabled={busy} onClick={() => run('onboard')}>
          Create your Midnight Passport
        </button>
        <button disabled={busy} onClick={() => run('signin')} className="secondary">
          Sign in with an existing passkey
        </button>
      </div>
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
          <dt>PRF enabled at create()</dt>
          <dd data-testid="prf-enabled">
            {outcome.prfEnabled === null ? 'n/a (sign-in)' : String(outcome.prfEnabled)}
          </dd>
          <dt>Derived P-256 public key</dt>
          <dd>
            <code data-testid="pubkey">
              {outcome.publicKeyHex ?? 'no PRF output — unsupported by this authenticator'}
            </code>
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
