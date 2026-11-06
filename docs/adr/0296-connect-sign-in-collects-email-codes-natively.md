# ADR-0296: Connect sign-in collects email codes in the app

- Status: Proposed
- Date: 2026-11-06
- Issue: #3464 (relates to ADR-0241)

## Context

The phone signs in to Connect with WorkOS AuthKit in `ASWebAuthenticationSession` (Authorization Code with PKCE, a public client). AuthKit's hosted email-code page writes each digit itself on `keydown`, cancels the event and fires a synthetic `input`. On iOS 27 Safari digits arrive with `keyCode 229`; cancelling that `keydown` does not stop WebKit's own `insertText`, so each tap inserts the digit twice and the page auto-submits a wrong code. The page belongs to WorkOS, the system auth sheet cannot run our scripts, and an embedded web view is not an acceptable place for a sign-in page.

WorkOS Magic Auth can create and check the same codes through the API, but checking a code requires the client secret, so the phone cannot call it directly.

## Decision

- The relay exposes two unauthenticated routes: `POST /v1/auth/email-code` asks WorkOS to email a code (the reply never says whether the account exists), and `POST /v1/auth/email-code/verify` exchanges the code with the Magic Auth grant using `WORKOS_API_KEY` as the client secret and returns only `refresh_token` and `user { id, email }`. Both are rate-limited per email and per caller IP through `CONNECT_LIMIT`. `/v1/config` advertises `emailCode: true` only when the relay has the key and the `CONNECT_LIMIT` binding, so a deploy without the rate limiter keeps the routes off.
- The phone shows its own email and code sheet when the relay advertises it. The code is one native field (`oneTimeCode`, number pad), so iOS fills or types it once. The resulting session is stored and refreshed exactly like an AuthKit session.
- The sheet also shows Continue with Apple and Continue with Google. They open the system auth sheet with `provider=AppleOAuth` or `GoogleOAuth` on the same PKCE authorize request, so the user lands directly on Apple's or Google's page without the AuthKit picker. WorkOS has no API that accepts a native Apple or Google ID token, so the native Sign in with Apple panel and the Google account picker stay out of scope. **Other sign-in options** opens AuthKit itself. The sheet follows the usual app sign-in layout: the app icon and a welcome heading, the provider buttons (Apple first on iOS, Google first on Android), an "or" divider, then the email field. Sign-in and sign-up are one flow, because the first sign-in creates the account. The provider buttons follow each brand's rules: the Apple logo with black fill in light mode and white in dark, and Google's four-colour G on white with a grey outline in light mode and on `#131314` in dark. Both use the same size and shape, so neither is more prominent, as App Review guideline 4.8 requires. The browser opens on top of the sheet, which stays open: iOS refuses to present an auth session from a screen that is being dismissed and the call then never settles, and keeping the sheet means a cancelled browser lands the user back on their sign-in choices.
- AuthKit in the system auth sheet stays the path for SSO and any account WorkOS answers with an organization, MFA or SSO requirement (`use-browser-sign-in`), and for relays without the key.

## Consequences

- The relay now handles sign-in codes and refresh tokens in transit; it logs neither.
- Rolling back is a relay config change: without `WORKOS_API_KEY` the phone falls back to AuthKit.
- The phone refreshes these sessions without the secret; this must hold for Magic Auth sessions before release (`node scripts/workos-secret.mjs probe-email-code staging`).

## WorkOS environments

Connect uses the WorkOS team **BotHarness**, project **TOB**: Production `client_01M5F0C09JH5QPFX9160RFCKTH` (the live relay's `WORKOS_CLIENT_ID`) and Staging `client_01M54TZZAA0Y6A248NCFYD84A5`. Magic Auth, Google and Apple are enabled in both, so turning this on needs no WorkOS change and no account migration: the relay only needs `WORKOS_API_KEY` from the same Production environment. Verify a key with `node scripts/workos-secret.mjs probe-email-code staging` before deploying.
