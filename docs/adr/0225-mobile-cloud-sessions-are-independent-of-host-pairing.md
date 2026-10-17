# ADR-0225: Mobile cloud sessions are independent of Host pairing

- Status: Accepted for the T1 UAT slice; native qualification pending
- Date: 2026-10-18
- Issue: [#2101](https://github.com/BotHarness/DeepSeekBot/issues/2101)

## Context

TOB is an independent cloud group service. Its administrator must be able to connect from a phone without pairing a running DSH Host. Host owner tokens cannot authorize TOB requests, and a QR code must not copy another device's login.

## Decision

`src/cloud/CloudClient` owns imported instance configuration and cloud sessions. Screens use its public snapshot/actions. `native.ts` provides Expo SecureStore, explicit native `expo/fetch`, random/S256 crypto and the system authentication browser. Existing HostSession and push/telemetry owners remain independent.

The deployer produces complete public JSON after authenticated control-plane verification. The phone accepts that JSON through camera scanning or explicit text paste, with the same bounded parser and trust confirmation. The phone reviews the server and confirms trust, then compares credential-free discovery against fixed configuration. It never downloads a configuration URL from a QR. Critical replacement needs explicit confirmation and removes that instance's local session. Discovery consistency cannot prove server ownership; only the trusted delivery process establishes that choice.

WorkOS login uses a live ten-minute PKCE/state transaction and the exact registered development callback. The callback has a dedicated reverse-domain scheme. Router intent handling drops OAuth parameters; process death or cancellation starts a fresh login. A cold link cannot create a session. Custom schemes are not exclusive ownership proofs, so PKCE/state remain mandatory.

One bounded SecureStore record holds at most twenty instance entries and their separate token pairs, avoiding partial writes between credential fields. SecureStore failures fail the operation; there is no plaintext fallback. Unverified token fields never grant access: expiry is a refresh hint, and the service's signature-verified `/api/me` establishes current admission. Operations are serialized, rotated credentials are saved before readback, and logout distinguishes confirmed remote revocation from local-only cleanup. The UI snapshot never exposes token/code/verifier material. No offline identity admission is restored from storage.

The portable configuration validator is copied from the pinned TOB source named in `src/cloud/README.md`; this narrow protocol surface is not a new SDK or a second service authority. Contract changes require reviewing both repos and their compatibility cases.

## Consequences

This needs a new SDK58 development binary with Expo Crypto/WebBrowser and the callback scheme. Source tests/exports cannot qualify camera, secure storage, browser return or Human login. T1 closes only after native verification and the remaining organization/revocation slices. Organization controls, T2 group messaging, Prod and store releases remain outside this change.
