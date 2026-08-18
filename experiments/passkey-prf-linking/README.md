# Experiment — passkey PRF linking across origins (Related Origin Requests)

Validates the "Passport as common WebAuthn identity layer" hypothesis: a
partner dApp (**nightfi.test**) creates a passkey under RP ID
**midnightpassport.test** via a WebAuthn **Related Origin Request (ROR)**,
evaluates the **PRF** extension, and derives a P-256 public key; the
Passport-alike app (**midnightpassport.test**) later authenticates with the
same passkey and derives the **same** public key. Results live in
[`findings.md`](./findings.md).

Two standalone Vite + React apps (deliberately separate — no shared code at
runtime), a mini pnpm workspace **outside** the SDK root workspace (own
lockfile, same 7-day cooldown posture), and an automated Playwright check.

## Anatomy

| Piece | Role |
|---|---|
| `nightfi/` | Partner dApp: `credentials.create()` under the Passport RP ID (the ROR moment) + PRF → derived key; simulates the ACC deploy (32 random bytes) and writes the address to the credential's **largeBlob** |
| `passport/` | Passport-alike: discoverable-credential `get()` + same PRF salt → derived key + compare box; reads the **largeBlob** back and shows the attached deployed-contract address |
| `passport/public/.well-known/webauthn` | The ROR authorisation: `{ "origins": ["https://nightfi.test"] }` |
| `Caddyfile` | Manual mode: TLS front on 443 for both domains, proxying the two Vite dev servers |
| `e2e/` | Automated mode: static HTTPS host-routing server + Playwright with a CDP virtual authenticator (`hasPrf`) |

The RP ID's well-known fetch always targets **port 443** — whatever serves
`midnightpassport.test` must listen there.

## Automated run (headless, virtual authenticator)

```sh
pnpm install
pnpm build
pnpm e2e          # needs to bind 127.0.0.1:443 — see below
```

Port 443 is privileged. Sudo-free option — run the whole thing in a private
network namespace (root inside the namespace only):

```sh
unshare -r -n sh -c 'ip link set lo up && pnpm e2e'
```

Or allow unprivileged 443 system-wide (needs sudo, reverts on reboot):

```sh
sudo sysctl net.ipv4.ip_unprivileged_port_start=443
pnpm e2e
```

The script prints a JSON summary (create-under-ROR outcome, PRF
availability, both derived keys, match verdict) — paste into `findings.md`.

## Manual run (real browser, real authenticator)

1. Hosts entries (on **Windows** for a Windows browser against WSL2:
   `C:\Windows\System32\drivers\etc\hosts`; inside WSL: `/etc/hosts`):

   ```text
   127.0.0.1 nightfi.test
   127.0.0.1 midnightpassport.test
   ```

2. Install [Caddy](https://caddyserver.com) and trust its local CA:
   `caddy trust` (for a Windows browser, import Caddy's root CA into the
   Windows certificate store — Caddy prints its location).

3. Run the three processes from this directory:

   ```sh
   pnpm dev:nightfi     # vite on 127.0.0.1:5173
   pnpm dev:passport    # vite on 127.0.0.1:5174
   caddy run            # TLS front on 443 for both domains
   ```

4. In **Chrome/Edge 128+, Safari 18+, or Firefox 152+** (the ROR floor —
   older browsers fail with `SecurityError`):
   - `https://nightfi.test` → *Create your Midnight Passport* → note the
     derived public key. The passkey sheet should display the
     **midnightpassport.test** RP.
   - `https://midnightpassport.test` → *Continue with Passkey* → paste the
     nightfi key into the compare box → expect **✓ same public key**.

No real authenticator with PRF? Chrome DevTools → WebAuthn → enable the
virtual authenticator environment (ctap2 **(2.1)** / internal / resident
keys / user verification / **PRF** / **large blob**) and repeat.

## What this deliberately does not test

RP-side assertion verification (challenge issuance/validation), registry or
ACC integration, and the ~5-label limit on the ROR origins list — see the
SDK evaluation notes in `findings.md` §Implications.
