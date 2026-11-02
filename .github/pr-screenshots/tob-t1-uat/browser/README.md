# Native AuthKit browser acceptance — 2026-10-18 JST

## Local unattended regression: passed

Product JS: `216963322c70c7ea009392da66e9a0e1f4327727`; retained iOS native source: `a0b2919072af8fee62d8bb5fbb402fc52fb0d852`; driver: `b341c6454`. The driver changes test tooling only. Simulator: iPhone 17 Pro / iOS 26, 402 × 874, light/default text. WorkOS Emulate **0.15.0**, bound to loopback; no real identity or cloud request in this layer.

| Path           | Observation                                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal login   | Actual Expo system browser displayed WORKOS EMULATE, then returned to the same App. Normal CloudClient state check and code exchange succeeded using native Crypto's S256 verifier, without client secret. |
| Replay         | Immediate second exchange of the same authorization code returned HTTP 400 / invalid_grant.                                                                                                                |
| Wrong state    | Native INVALID_CALLBACK, no token request and no session.                                                                                                                                                  |
| Wrong verifier | Emulator rejected exchange with HTTP 400; native LOGIN_FAILED and no session.                                                                                                                              |
| Isolation      | Fixture visibly named LOCAL EMULATOR - not UAT; storage only in memory. Original runtime/config restored afterward, real UAT still signed out.                                                             |

The 68-second recording includes keyboard occlusion, dismissal and successful return, followed by restoring/resetting the local fixture at the end; that last state is **not a logout proof**. Screenshots and the 24-cell contact sheet were inspected; all form data in this recording are fictional. No real authentication-form footage is published.

The official emulator rejects our hostless custom callback spelling. The test-only loopback adapter maps an HTTP callback returned by the emulator to the unchanged native URI. It does not change the app's callback checks. This proves native browser return and client PKCE/state behavior against the emulator, **not** live WorkOS callback registration or actual TOB admission. The fixture identity response is local, albeit backed by a verified emulator JWT signature. Existing real-UAT session-lifecycle evidence remains a distinct layer.

## Live unattended smoke attempt: not passed

A bounded real Staging attempt used the existing initialized administrator, normal Hosted AuthKit and an API-created email code. The initial native fill stopped because the six one-character inputs and invalidated accessibility refs require per-field fresh snapshots. After correcting input handling, the hosted page rejected the code as expired. Whether an API-created code can complete that pre-existing Hosted AuthKit transaction was **not established**; this is not a successful native hosted login.

The browser transaction was canceled. Magic Auth was restored to its previous disabled value; signup remained disabled. The one-time code file was removed. No password change, new user, account-role change, Radar bypass, deployment or Prod operation occurred. The local suite follows [WorkOS testing guidance](https://workos.com/docs/authkit/testing); routine automation should not depend on live hosted-page bots.

## T1 close gates still separate

The successful live hosted browser gate is recorded separately when completed. T1 additionally needs the organization slice (mobile create/list/switch and independent CLI readback), owner/member and no-membership denials, idempotent WorkOS/D1/Org DO creation/recovery, signed identity events and reconciliation/revocation windows, and the remaining deployment/import/native/Human-QA matrix. Physical QR capture, Android and accessibility/theme qualification have not been demonstrated by this Simulator run. Neither this report nor green CI closes T1 or authorizes T2/Prod.
