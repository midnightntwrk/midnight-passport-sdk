import { useState } from 'react';
import {
  createPassportPasskey,
  assertBundled,
  fromBase64Url,
  toBase64Url,
  toHex,
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

function FlagRow({
  label,
  testid,
  value,
  naText,
}: {
  label: string;
  testid: string;
  value: boolean | null;
  naText: string;
}) {
  const text = value === null ? naText : String(value);
  const cls = value === null ? 'tag--muted' : value ? 'tag--yes' : 'tag--no';
  return (
    <div className="receipt__row">
      <dt>{label}</dt>
      <dd>
        <span className={`tag ${cls}`} data-testid={testid}>
          {text}
        </span>
      </dd>
    </div>
  );
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
        // Two ceremonies (the spec floor): create(), then ONE get() bundling
        // prf.eval + largeBlob.write. largeBlob writes are illegal at create(),
        // so that follow-up get() is unavoidable — but it carries the PRF eval
        // too, so no third prompt. create() also attempts prf.eval, so a
        // provider that returns PRF at registration derives the key with no
        // dependence on the get() at all.
        const created = await createPassportPasskey('nightfi-demo-user');
        localStorage.setItem(CREDENTIAL_ID_KEY, toBase64Url(created.credential.rawId));
        logStep(
          `create(): ok — prfEnabled=${created.prfEnabled}, prfAtCreate=${created.prfOutput ? '32 bytes' : 'none'}, largeBlobSupported=${created.largeBlobSupported}`,
        );

        // Simulate provisioning the user's on-chain infrastructure: the
        // "deployed ACC contract address" is 32 random bytes, attached to the
        // credential via largeBlob so the Passport app can discover it from the
        // passkey alone — written in the same gesture that (re)evaluates PRF.
        const accAddress = crypto.getRandomValues(new Uint8Array(32));
        let publicKeyHex = created.prfOutput ? derivePublicKeyHex(created.prfOutput) : null;
        let blobWritten: boolean | null = null;
        try {
          const bundled = await assertBundled({
            prf: true,
            largeBlobWrite: accAddress,
            allowCredentialId: created.credential.rawId,
          });
          blobWritten = bundled.written;
          if (!publicKeyHex && bundled.prfOutput) publicKeyHex = derivePublicKeyHex(bundled.prfOutput);
          logStep(
            `get(prf.eval + largeBlob.write): ok — prf=${bundled.prfOutput ? '32 bytes' : 'DROPPED'}, written=${bundled.written}`,
          );
        } catch (cause) {
          const err = cause as Error;
          logStep(`get(prf.eval + largeBlob.write): FAILED — ${err.name}: ${err.message}`);
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
        // One ceremony: prf.eval + largeBlob.read bundled. Prefer the
        // credential ID remembered from onboarding (allowlisted assertions work
        // under ROR even where discoverable enumeration does not); fall back to
        // the discoverable flow without one.
        const storedId = localStorage.getItem(CREDENTIAL_ID_KEY);
        logStep(`sign-in: allowlist=${storedId ? 'stored credential ID' : 'none (discoverable)'}`);
        const bundled = await assertBundled({
          prf: true,
          largeBlobRead: true,
          allowCredentialId: storedId ? fromBase64Url(storedId) : undefined,
        });
        logStep(
          `get(prf.eval + largeBlob.read): ok — prf=${bundled.prfOutput ? '32 bytes' : 'DROPPED'}, blob=${bundled.blob ? `${bundled.blob.length} bytes` : 'none'}`,
        );
        setOutcome({
          credentialId: toBase64Url(bundled.credential.rawId),
          prfEnabled: null,
          publicKeyHex: bundled.prfOutput ? derivePublicKeyHex(bundled.prfOutput) : null,
          largeBlobSupported: null,
          accAddressHex: bundled.blob ? toHex(bundled.blob) : null,
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

  const issued = outcome?.prfEnabled !== null && outcome !== null;

  return (
    <div className="night">
      <div className="frame">
        <header className="marquee">
          <div className="sign">
            <span className="sign__night">Night</span>
            <span className="sign__fi">Fi</span>
          </div>
          <span className="sign__open">Open · Midnight</span>
          <p className="marquee__eyebrow">
            Partner dApp · issues under <code>{RP_ID}</code>
          </p>
          <h1 className="marquee__headline">Your Midnight Passport, issued after hours.</h1>
          <p className="marquee__lede">
            Create a passkey scoped to Midnight Passport (a Related Origin Request from{' '}
            <code>{location.host}</code>), evaluate the PRF to derive your portable P-256 key, deploy
            your contract, and staple its address to the credential via largeBlob — then walk it to
            the border and be recognised.
          </p>
        </header>

        <div className="actions">
          <button className="btn btn--issue" disabled={busy} onClick={() => run('onboard')}>
            Create your Midnight Passport
          </button>
          <button className="btn btn--ghost" disabled={busy} onClick={() => run('signin')}>
            Sign in with an existing passkey
          </button>
        </div>

        {log.length > 0 && (
          <ol className="tape" data-testid="steps">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}

        {error && (
          <p className="notice" data-testid="error">
            {error}
          </p>
        )}

        {outcome && (
          <section className="receipt">
            <div className="receipt__title">
              Issuance receipt
              <span>{issued ? 'NEW CREDENTIAL' : 'RE-AUTH'}</span>
            </div>
            <div className="receipt__perf" />

            <dl>
              <div className="receipt__row">
                <dt>Holder key — P-256, derived from PRF</dt>
                <dd>
                  <code data-testid="pubkey">
                    {outcome.publicKeyHex ?? 'no PRF output — unsupported by this authenticator'}
                  </code>
                </dd>
              </div>
              <div className="receipt__row">
                <dt>Deployed contract (ACC) — 32 bytes, stapled via largeBlob</dt>
                <dd>
                  <code data-testid="acc-address">{outcome.accAddressHex ?? 'none'}</code>
                </dd>
              </div>
              <div className="receipt__row">
                <dt>Credential</dt>
                <dd>
                  <code data-testid="credential-id">{outcome.credentialId}</code>
                </dd>
              </div>
              <FlagRow
                label="PRF enabled at create()"
                testid="prf-enabled"
                value={outcome.prfEnabled}
                naText="n/a (sign-in)"
              />
              <FlagRow
                label="largeBlob supported"
                testid="largeblob-supported"
                value={outcome.largeBlobSupported}
                naText="n/a (sign-in)"
              />
              <FlagRow
                label="Address written to the passkey"
                testid="blob-written"
                value={outcome.blobWritten}
                naText="n/a"
              />
            </dl>

            <div className="receipt__stamp">{issued ? 'Issued · Midnight' : 'Re-authenticated'}</div>
          </section>
        )}
      </div>
    </div>
  );
}
