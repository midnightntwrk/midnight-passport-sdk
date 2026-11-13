# Stories

One file per story, in roadmap order. Each story becomes a GitHub issue with
the `story` label and its epic's label, in its milestone, as a sub-issue of
its epic. The story issues are not filed yet.

The stories are in two folders:

- [`accepted/`](./accepted/): stories the team has reviewed and accepted.
  Their steps follow their dependencies.
- [`proposed/`](./proposed/): first drafts, waiting for review. Their steps
  can lag behind changes to the accepted stories they depend on.

A story moves from `proposed/` to `accepted/` once it is reviewed.

File names sort in roadmap order: `M<milestone>-<epic>-S<step>-<code>-<slug>.md`.
The tasks in each story are a first cut: `mn-passport-skills:spec-driver`
replaces them with the real tranches when it plans the spec.

## Accepted

| Story | Title | Step |
|---|---|---|
| [E03.01](./accepted/M1-E03-S01-E03.01-exact-pins-7-day-cooldown-lockfile-the-remaining-work.md) | Exact pins, 7-day cooldown, lockfile: the remaining work | 01 |
| [E03.02](./accepted/M1-E03-S03-E03.02-monorepo-scaffold-for-mn-passport-packages.md) | Monorepo scaffold for mn-passport-* packages | 03 |
| [E03.04](./accepted/M1-E03-S04-E03.04-owner-kernel-secret-boundary-and-secret-hygiene.md) | Owner kernel: secret boundary and secret hygiene | 04 |
| [E03.05](./accepted/M1-E03-S04-E03.05-wire-and-binding-version-axes.md) | Wire and binding version axes | 04 |
| [E03.06](./accepted/M1-E03-S04-E03.06-ci-boundary-lint-and-pr-budget-checks-the-remaining.md) | CI boundary lint and PR budget checks: the remaining work | 04 |
| [E03.07](./accepted/M1-E03-S04-E03.07-signed-npm-release-pipeline.md) | Signed npm release pipeline | 04 |
| [E03.08](./accepted/M1-E03-S04-E03.08-domain-separation-tag-constants.md) | Domain-separation tag constants | 04 |
| [E03.10](./accepted/M1-E03-S04-E03.10-effect-4-inside-the-sdk-bundling-and-the-midnight-js.md) | Effect 4 inside the SDK: bundling and the midnight-js adapter file | 04 |
| [E03.03](./accepted/M1-E03-S05-E03.03-seam-interface-definitions.md) | Seam interface definitions | 05 |
| [E04.01](./accepted/M1-E04-S01-E04.01-sponsor-policy-and-typed-refusals.md) | Sponsor policy and typed refusals | 01 |
| [E04.20](./accepted/M1-E04-S01-E04.20-account-secrets-and-deploy-inputs-without-a-passkey.md) | Account secrets and deploy inputs without a passkey-derived secret (spec and ADR) | 01 |
| [E04.02](./accepted/M1-E04-S06-E04.02-keyprovider-across-p256-k256-and-jubjub.md) | KeyProvider across p256, k256 and JubJub | 06 |
| [E04.03](./accepted/M1-E04-S06-E04.03-adapter-prover-remote.md) | adapter-prover-remote | 06 |
| [E04.04](./accepted/M1-E04-S06-E04.04-adapter-broadcast-sponsor-payment-submit-follow.md) | adapter-broadcast: sponsor payment, submit, follow, resubmit | 06 |
| [E04.05](./accepted/M1-E04-S06-E04.05-adapter-browser-and-adapter-nodejs.md) | adapter-browser and adapter-nodejs | 06 |
| [E04.06](./accepted/M1-E04-S06-E04.06-indexer-seam-transaction-status-and-account-state.md) | Indexer seam: transaction status and account state | 06 |
| [E04.15](./accepted/M1-E04-S06-E04.15-partial-deploy-circuit-checks.md) | Partial-deploy circuit checks | 06 |
| [E04.07](./accepted/M1-E04-S07-E04.07-adapter-waas-k256-key-and-account-metadata.md) | adapter-waas: k256 key and account metadata | 07 |
| [E04.10](./accepted/M1-E04-S07-E04.10-prover-disclosure-text-and-consent-hook-rule-2.md) | Prover disclosure text and consent hook (rule 2) | 07 |
| [E04.11](./accepted/M1-E04-S07-E04.11-passkey-on-the-p256-arm-as-the-first-owner-key.md) | Passkey on the p256 arm as the first owner key | 07 |
| [E04.12](./accepted/M1-E04-S08-E04.12-account-deploy-in-waves-plan-send-resume-activate.md) | Account deploy in waves: plan, send, resume, activate | 08 |
| [E04.13](./accepted/M1-E04-S08-E04.13-existing-account-lookup.md) | Existing-account lookup | 08 |
| [E04.14](./accepted/M1-E04-S08-E04.14-webauthn-authenticator-support-matrix-and-fallbacks.md) | WebAuthn authenticator support matrix and fallbacks | 08 |
| [E04.09](./accepted/M1-E04-S09-E04.09-starting-balance.md) | Starting balance | 09 |
| [E04.16](./accepted/M1-E04-S09-E04.16-name-registration-call.md) | Name registration call | 09 |
| [E04.22](./accepted/M1-E04-S09-E04.22-add-circuits-to-a-live-account-grant-spend-circuits.md) | Add circuits to a live account: grant-spend circuits and later arms | 09 |
| [E04.17](./accepted/M1-E04-S10-E04.17-waas-key-as-isolated-backup-owner-key.md) | WaaS key as isolated backup owner key | 10 |
| [E04.18](./accepted/M1-E04-S10-E04.18-name-to-acc-resolution.md) | Name-to-ACC resolution | 10 |
| [E04.21](./accepted/M1-E04-S10-E04.21-example-page-create-an-account-and-approve-a-grant.md) | Example page: create an account and approve a grant | 10 |
| [E05.01](./accepted/M1-E05-S01-E05.01-acc-artifact-build-and-publication-adr.md) | ACC artifact build and publication (ADR) | 01 |
| [E05.02](./accepted/M1-E05-S02-E05.02-acc-circuit-interface-for-dapp-composition.md) | ACC circuit interface for dApp composition | 02 |
| [E05.03](./accepted/M1-E05-S05-E05.03-acc-artifact-loader-module-decoder-manifest.md) | ACC artifact loader (module, decoder, manifest) | 05 |
| [E05.04](./accepted/M1-E05-S07-E05.04-binding-version-registry.md) | Binding version registry | 07 |
| [E06.01](./accepted/M1-E06-S09-E06.01-onboarding-flow-passkey-creation.md) | Onboarding flow: passkey creation | 09 |
| [E06.02](./accepted/M1-E06-S10-E06.02-deploy-progress-and-balance-ui.md) | Deploy progress and balance UI | 10 |
| [E06.03](./accepted/M1-E06-S10-E06.03-returning-user-account-resume.md) | Returning-user account resume | 10 |
| [E07.01](./accepted/M2-E07-S09-E07.01-inbox-entries-the-coin-store-and-deposits-into-an.md) | Inbox entries, the coin store, and deposits into an account | 09 |
| [E07.03](./accepted/M2-E07-S10-E07.03-send-from-the-account-to-a-wallet-address.md) | Send from the account to a wallet address | 10 |
| [E07.05](./accepted/M2-E07-S10-E07.05-holdings-and-activity-reads.md) | Holdings and activity reads | 10 |
| [E07.02](./accepted/M2-E07-S11-E07.02-pay-another-passport-shielded-in-one-joined-transaction.md) | Pay another Passport: shielded, in one joined transaction | 11 |
| [E07.04](./accepted/M2-E07-S11-E07.04-rebuild-the-coin-store-from-the-chain.md) | Rebuild the coin store from the chain | 11 |
| [E07.06](./accepted/M2-E07-S11-E07.06-pay-another-passport-unshielded-in-two-legs.md) | Pay another Passport: unshielded, in two legs | 11 |
| [E08.01](./accepted/M2-E08-S11-E08.01-name-claim-screen.md) | Name claim screen | 11 |
| [E08.02](./accepted/M2-E08-S11-E08.02-activity-feed.md) | Activity feed | 11 |
| [E08.04](./accepted/M2-E08-S11-E08.04-account-home-holdings-and-entry-points.md) | Account home: holdings and entry points | 11 |
| [E08.05](./accepted/M2-E08-S11-E08.05-receive-screen-and-deposit-page.md) | Receive screen and deposit page | 11 |
| [E08.03](./accepted/M2-E08-S12-E08.03-send-screens.md) | Send screens | 12 |

## Proposed

| Story | Title | Step |
|---|---|---|
| [E01.01](./proposed/M0-E01-S01-E01.01-architecture-and-requirements-review-doc-sync.md) | Architecture and requirements review (doc-sync) | 01 |
| [E01.02](./proposed/M0-E01-S01-E01.02-dev-workflow-review-skills-ci-non-negotiables.md) | Dev workflow review: skills, CI, non-negotiables | 01 |
| [E01.03](./proposed/M0-E01-S02-E01.03-roadmap-sign-off-and-issue-filing.md) | Roadmap sign-off and issue filing | 02 |
| [E02.01](./proposed/M1-E02-S01-E02.01-brand-tokens-color-type-iconography.md) | Brand tokens: color, type, iconography | 01 |
| [E02.02](./proposed/M1-E02-S02-E02.02-ui-component-library-and-interaction-patterns.md) | UI component library and interaction patterns | 02 |
| [E02.03](./proposed/M1-E02-S02-E02.03-voice-and-copy-guidelines.md) | Voice and copy guidelines | 02 |
| [E04.19](./proposed/M1-E04-S11-E04.19-recovery-via-the-waas-backup-owner-key.md) | Recovery via the WaaS backup owner key | 11 |
| [E05.05](./proposed/M1-E05-S06-E05.05-dapp-artifact-loader-with-integrity-checks.md) | dApp artifact loader with integrity checks | 06 |
| [E09.01](./proposed/M3-E09-S05-E09.01-grantrequest-browser-profile.md) | GrantRequest: browser profile | 05 |
| [E09.02](./proposed/M3-E09-S05-E09.02-grantrequest-agent-profile.md) | GrantRequest: agent profile | 05 |
| [E09.03](./proposed/M3-E09-S05-E09.03-sign-in-message-mip-10.md) | Sign-in message (MIP §10) | 05 |
| [E09.04](./proposed/M3-E09-S05-E09.04-protocol-version-handling.md) | PROTOCOL_VERSION handling | 05 |
| [E10.01](./proposed/M3-E10-S06-E10.01-shared-scope-type-for-all-grantees.md) | Shared scope type for all grantees | 06 |
| [E10.02](./proposed/M3-E10-S07-E10.02-authorizer-page-mip-9.md) | Authorizer page (MIP §9) | 07 |
| [E10.03](./proposed/M3-E10-S08-E10.03-issue-grant-call.md) | issue_grant call | 08 |
| [E10.04](./proposed/M3-E10-S09-E10.04-on-chain-grant-reads-and-scope-helpers.md) | On-chain grant reads and scope helpers | 09 |
| [E10.05](./proposed/M3-E10-S09-E10.05-grant-revocation-call.md) | Grant revocation call | 09 |
| [E10.06](./proposed/M3-E10-S09-E10.06-spend-limited-grant.md) | Spend-limited grant | 09 |
| [E10.07](./proposed/M3-E10-S10-E10.07-grant-listing-from-chain.md) | Grant listing from chain | 10 |
| [E10.08](./proposed/M3-E10-S10-E10.08-child-passport-subdomain-name-and-grant.md) | Child Passport: subdomain name and grant | 10 |
| [E11.01](./proposed/M3-E11-S06-E11.01-ows-key-provider-for-agents.md) | OWS key provider for agents | 06 |
| [E11.02](./proposed/M3-E11-S07-E11.02-agent-agent-profile-grant-ceremony.md) | agent: agent-profile grant ceremony | 07 |
| [E11.03](./proposed/M3-E11-S08-E11.03-connect-browser-grant-ceremony.md) | connect: browser grant ceremony | 08 |
| [E12.01](./proposed/M3-E12-S09-E12.01-authorizer-screens-browser-and-agent-profiles.md) | Authorizer screens (browser and agent profiles) | 09 |
| [E12.02](./proposed/M3-E12-S10-E12.02-e2e-dapp-grant-ceremony-with-a-test-dapp.md) | E2E: dApp grant ceremony with a test dApp | 10 |
| [E12.03](./proposed/M3-E12-S10-E12.03-e2e-agent-grant-ceremony-with-a-test-agent.md) | E2E: agent grant ceremony with a test agent | 10 |
| [E12.04](./proposed/M3-E12-S11-E12.04-grant-list-and-revoke-screen.md) | Grant list and revoke screen | 11 |
| [E12.05](./proposed/M3-E12-S11-E12.05-child-passport-screens.md) | Child Passport screens | 11 |
| [E13.01](./proposed/M4-E13-S09-E13.01-connect-project-template.md) | connect project template | 09 |
| [E13.02](./proposed/M4-E13-S10-E13.02-connect-sign-in-verification.md) | connect: sign-in verification | 10 |
| [E13.03](./proposed/M4-E13-S11-E13.03-connect-new-user-redirect-to-onboarding.md) | connect: new-user redirect to onboarding | 11 |
| [E13.04](./proposed/M4-E13-S12-E13.04-onboarding-funnel-instrumentation.md) | Onboarding funnel instrumentation | 12 |
| [E14.01](./proposed/M4-E14-S07-E14.01-scope-to-text-rendering.md) | Scope-to-text rendering | 07 |
| [E14.02](./proposed/M4-E14-S07-E14.02-agent-identity-bound-to-its-grant.md) | Agent identity bound to its grant | 07 |
| [E14.03](./proposed/M4-E14-S10-E14.03-agent-grant-status-checks-for-ows.md) | agent: grant status checks for OWS | 10 |
| [E15.01](./proposed/M5-E15-S05-E15.01-intent-joiner-dapp-intent-acc-payment.md) | Intent joiner: dApp intent + ACC payment | 05 |
| [E15.02](./proposed/M5-E15-S06-E15.02-adapter-prover-wasm-after-v1.md) | adapter-prover-wasm (after V1) | 06 |
| [E15.03](./proposed/M5-E15-S10-E15.03-grant-key-call-pipeline-sign-prove-broadcast.md) | Grant-key call pipeline: sign, prove, broadcast | 10 |
| [E15.04](./proposed/M5-E15-S11-E15.04-connect-grant-key-calls-passport-closed.md) | connect: grant-key calls, Passport closed | 11 |
| [E15.05](./proposed/M5-E15-S11-E15.05-connect-pay-with-passport-deposit-joiner.md) | connect: Pay with Passport (deposit + joiner) | 11 |
| [E15.06](./proposed/M5-E15-S11-E15.06-agent-grant-key-calls-on-node-js.md) | agent: grant-key calls on Node.js | 11 |
| [E15.07](./proposed/M5-E15-S12-E15.07-reference-dapp.md) | Reference dApp | 12 |
| [E16.01](./proposed/M5-E16-S13-E16.01-e2e-suite-in-ci.md) | E2E suite in CI | 13 |
| [E17.01](./proposed/M6-E17-S05-E17.01-wpp-client-and-storage-seam.md) | WPP client and storage seam | 05 |
| [E17.02](./proposed/M6-E17-S06-E17.02-password-wrapped-wpp-backup.md) | Password-wrapped WPP backup | 06 |
| [E17.03](./proposed/M6-E17-S06-E17.03-adapter-wpp-backend-targets-drive-first.md) | adapter-wpp-<backend> targets (Drive first) | 06 |
| [E17.04](./proposed/M6-E17-S06-E17.04-core-wpp-privatestateprovider-one-package-key.md) | core: WPP PrivateStateProvider (one package key) | 06 |
| [E17.05](./proposed/M6-E17-S07-E17.05-wpp-restore-on-a-new-device.md) | WPP restore on a new device | 07 |
| [E17.06](./proposed/M6-E17-S07-E17.06-backup-freshness-state.md) | Backup freshness state | 07 |
| [E17.07](./proposed/M6-E17-S08-E17.07-client-read-surface-and-package-key-handoff.md) | Client read surface and package-key handoff | 08 |
| [E18.01](./proposed/M6-E18-S09-E18.01-connect-package-key-handoff.md) | connect: package-key handoff | 09 |
| [E18.02](./proposed/M6-E18-S09-E18.02-agent-sealed-package-key-handoff.md) | agent: sealed package-key handoff | 09 |
| [E18.03](./proposed/M6-E18-S10-E18.03-connect-inject-the-privatestateprovider.md) | connect: inject the PrivateStateProvider | 10 |
| [E18.04](./proposed/M6-E18-S10-E18.04-agent-inject-the-privatestateprovider.md) | agent: inject the PrivateStateProvider | 10 |
| [E18.05](./proposed/M6-E18-S10-E18.05-e2e-private-data-handoff-with-the-test-dapp-and-ag.md) | E2E: private-data handoff with the test dApp and agent | 10 |
| [E18.06](./proposed/M6-E18-S13-E18.06-reference-dapp-private-state.md) | Reference dApp: private state | 13 |
| [E19.01](./proposed/M6-E19-S05-E19.01-device-enrollment-request-qr-or-link-payload.md) | Device enrollment request (QR or link payload) | 05 |
| [E19.02](./proposed/M6-E19-S08-E19.02-owner-key-add-and-remove-on-the-acc.md) | Owner key add and remove on the ACC | 08 |
| [E19.03](./proposed/M6-E19-S09-E19.03-k256-wallet-as-an-owner-key.md) | k256 wallet as an owner key | 09 |
| [E19.04](./proposed/M6-E19-S09-E19.04-viewing-key-distribution-to-each-device.md) | Viewing-key distribution to each device | 09 |
| [E19.05](./proposed/M6-E19-S10-E19.05-new-device-bootstrap-keys-and-state.md) | New-device bootstrap: keys and state | 10 |
| [E19.06](./proposed/M6-E19-S11-E19.06-private-state-sync-over-wpp.md) | Private-state sync over WPP | 11 |
| [E19.07](./proposed/M6-E19-S12-E19.07-two-device-consistency-test.md) | Two-device consistency test | 12 |
| [E20.01](./proposed/M6-E20-S08-E20.01-backup-and-restore-screens.md) | Backup and restore screens | 08 |
| [E20.02](./proposed/M6-E20-S09-E20.02-devices-screen-owner-key-list.md) | Devices screen (owner key list) | 09 |
| [E20.03](./proposed/M6-E20-S11-E20.03-device-join-and-sync-screens.md) | Device join and sync screens | 11 |
| [E21.01](./proposed/M7-E21-S05-E21.01-mip-0022-recovery-message-types.md) | MIP-0022 recovery message types | 05 |
| [E21.02](./proposed/M7-E21-S06-E21.02-adapter-recovery-sealed-guardian-transport.md) | adapter-recovery: sealed guardian transport | 06 |
| [E21.03](./proposed/M7-E21-S06-E21.03-recovery-interop-test-vectors.md) | Recovery interop test vectors | 06 |
| [E21.04](./proposed/M7-E21-S07-E21.04-guardian-share-response.md) | Guardian share response | 07 |
| [E21.05](./proposed/M7-E21-S09-E21.05-guardian-enrollment-and-share-sealing.md) | Guardian enrollment and share sealing | 09 |
| [E21.06](./proposed/M7-E21-S10-E21.06-guardian-diversity-checks.md) | Guardian diversity checks | 10 |
| [E21.07](./proposed/M7-E21-S10-E21.07-secret-reconstruction-and-recovery-start.md) | Secret reconstruction and recovery start | 10 |
| [E21.08](./proposed/M7-E21-S11-E21.08-recovery-cancel-from-a-remaining-owner-key.md) | Recovery cancel from a remaining owner key | 11 |
| [E21.09](./proposed/M7-E21-S11-E21.09-recovery-finalize-after-the-delay.md) | Recovery finalize after the delay | 11 |
| [E21.10](./proposed/M7-E21-S11-E21.10-recovery-start-alerts.md) | Recovery-start alerts | 11 |
| [E21.11](./proposed/M7-E21-S12-E21.11-recovery-wrap-renewal-and-state-restore.md) | Recovery wrap renewal and state restore | 12 |
| [E22.01](./proposed/M7-E22-S13-E22.01-viewing-key-rotation-on-revocation.md) | Viewing-key rotation on revocation | 13 |
| [E22.02](./proposed/M7-E22-S13-E22.02-read-grant-viewing-key-lifecycle-rule-13.md) | Read-grant viewing-key lifecycle (rule 13) | 13 |
| [E22.03](./proposed/M7-E22-S14-E22.03-connect-read-grant-revocation-handling.md) | connect: read-grant revocation handling | 14 |
| [E23.01](./proposed/M7-E23-S11-E23.01-guardian-setup-and-recovery-screens.md) | Guardian setup and recovery screens | 11 |
| [E24.01](./proposed/M8-E24-S08-E24.01-did-midnight-creation.md) | did:midnight creation | 08 |
| [E24.02](./proposed/M8-E24-S09-E24.02-did-document-resolution.md) | DID document resolution | 09 |
| [E24.03](./proposed/M8-E24-S09-E24.03-acc-as-did-controller.md) | ACC as DID controller | 09 |
| [E24.04](./proposed/M8-E24-S10-E24.04-verifiable-credentials-selective-disclosure.md) | Verifiable credentials, selective disclosure | 10 |
| [E25.01](./proposed/M8-E25-S05-E25.01-multi-chain-signature-network-interface.md) | Multi-chain signature network interface | 05 |
| [E25.02](./proposed/M8-E25-S06-E25.02-adapter-multi-chain.md) | adapter-multi-chain | 06 |
| [E25.03](./proposed/M8-E25-S09-E25.03-eth-and-btc-deposit-flow.md) | ETH and BTC deposit flow | 09 |
| [E25.04](./proposed/M8-E25-S10-E25.04-cross-chain-swap-or-spend-via-joiner.md) | Cross-chain swap or spend via joiner | 10 |
