# ADR-0326: Connect password authentication stays with WorkOS

- Status: Proposed
- Date: 2026-11-12
- Issue: #4017
- Extends: ADR-0296

## Context

Mobile users and store reviewers need email/password sign-in. Reviewers use a prepared, verified account linked to a dedicated demonstration Host. Password authentication needs the WorkOS client secret, which cannot ship in the phone app. Existing email-code and browser sign-in already share WorkOS identities and the Connect secure session store.

## Decision

The existing native sign-in form defaults to email/password when `/v1/config` advertises `passwordAuth`. Its iOS text fields and Android Material outlined text fields retain native secure entry, autofill, system text scaling and keyboard-aware scrolling. Email codes, Apple, Google and hosted AuthKit remain available. Older relays keep the existing email-code/browser behavior.

The Connect relay owns four bounded unauthenticated POST routes: `/v1/auth/password`, `/register`, `/verify` and `/reset` (the latter three under `/v1/auth/password`). WorkOS remains the identity and password authority; no password database or parallel session store is introduced. Registration creates an unverified WorkOS user, then uses the same password grant as sign-in. An email verification challenge returns only its pending authentication token. The phone holds that token in the active flow, submits the one-time code through the relay and saves only the existing refresh-token/user session after authentication succeeds. Dismissing the flow prevents a late password response from saving a session.

Password reset requests use WorkOS's hosted reset link; neither the reset token nor URL is returned by the relay. Existing users can set a password through this flow without changing their account identity. The UI gives the same reset acknowledgment for missing accounts. Registration failures do not distinguish existing emails from password policy refusals. MFA, Radar, organization selection and other unsupported challenges require hosted AuthKit; they are never bypassed.

The Worker enables the capability only with `PASSWORD_AUTH_ENABLED=true`, the same-environment `WORKOS_API_KEY`, and `CONNECT_LIMIT`. Operators enable this only in environments permitting password authentication and open registration. Removing the flag hides the native password path while preserving existing sessions and email-code/browser sign-in. Email verification and reset delivery must remain enabled in WorkOS. Verify the hosted reset URL and mail delivery before production rollout.

Every action consumes email/challenge and shared caller-IP rate limits. Pending challenge tokens are hashed before becoming limiter keys. Request bodies, passwords, pending tokens, verification codes and refresh tokens are not logged. Responses use the relay's `no-store` policy. The mobile API deadline bounds requests; the relay adds no dependency and makes one WorkOS request per login/verification/reset, two for registration. Tests guard these request counts and require refusal before upstream calls when rate-limited.

## Verification and limits

Staging API qualification covers registration, email verification, wrong password, successful password authentication, public-client refresh with the same user ID, hosted reset and new-password authentication. Native verification, Android acceptance, actual email delivery and the reviewer account's public-network Host/chat journey remain distinct release gates; API success does not establish them. Store credentials stay private and are delivered through store review fields, never source, screenshots or PR text.

## References

- [WorkOS authentication API](https://workos.com/docs/reference/authkit/authentication)
- [Authentication challenges](https://workos.com/docs/reference/authkit/authentication-errors)
- [Password reset](https://workos.com/docs/reference/authkit/password-reset)
