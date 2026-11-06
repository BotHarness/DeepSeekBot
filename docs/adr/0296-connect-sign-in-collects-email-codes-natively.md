# ADR-0296: Connect sign-in collects email codes in the app

- Status: Proposed
- Date: 2026-11-06
- Issue: #3464 (relates to ADR-0241)

## Context

The phone signs in to Connect with WorkOS AuthKit in `ASWebAuthenticationSession` (Authorization Code with PKCE, a public client). AuthKit's hosted email-code page writes each digit itself on `keydown`, cancels the event and fires a synthetic `input`. On iOS 27 Safari digits arrive with `keyCode 229`; cancelling that `keydown` does not stop WebKit's own `insertText`, so each tap inserts the digit twice and the page auto-submits a wrong code. The page belongs to WorkOS, the system auth sheet cannot run our scripts, and an embedded web view is not an acceptable place for a sign-in page.

WorkOS Magic Auth can create and check the same codes through the API, but checking a code requires the client secret, so the phone cannot call it directly.

## Decision

- The relay exposes two unauthenticated routes: `POST /v1/auth/email-code` asks WorkOS to email a code (the reply never says whether the account exists), and `POST /v1/auth/email-code/verify` exchanges the code with the Magic Auth grant using `WORKOS_API_KEY` as the client secret and returns only `refresh_token` and `user { id, email }`. Both are rate-limited per email, and sending also per caller IP, through `CONNECT_LIMIT`. `/v1/config` advertises `emailCode: true` only when the relay has the key.
- The phone shows its own email and code sheet when the relay advertises it. The code is one native field (`oneTimeCode`, number pad), so iOS fills or types it once. The resulting session is stored and refreshed exactly like an AuthKit session.
- AuthKit in the system auth sheet stays the path for Google, Apple, SSO and any account WorkOS answers with an organization, MFA or SSO requirement (`use-browser-sign-in`), and for relays without the key.

## Consequences

- The relay now handles sign-in codes and refresh tokens in transit; it logs neither.
- Rolling back is a relay config change: without `WORKOS_API_KEY` the phone falls back to AuthKit.
- The phone refreshes these sessions without the secret; this must hold for Magic Auth sessions before release (`node scripts/workos-secret.mjs probe-email-code staging`).
