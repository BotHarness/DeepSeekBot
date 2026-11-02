# Unattended native UAT session verification

2026-10-18, 04:11–04:14 JST. Existing iPhone 17 Pro / iOS 26 Simulator, English, default text, light mode, 402 × 874. No Human login was required. No production deployment or product authorization change was made.

## What this proves

A separate session was authenticated through real WorkOS Staging's Magic Auth API and admitted by the real TOB UAT service. A local debugger fixture wrote it through the existing native SecureStore adapter, only after matching the already-trusted public UAT config. The App was then cold-started and operated through its normal native UI. This is **API authentication + native session lifecycle**, not a successful Hosted AuthKit/PKCE browser-login test.

| Observable behavior                                                       | Result and evidence                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Real API authentication and UAT admin admission                           | Pass; private operator profile and accepted bootstrap identity checked; no fake JWT or server bypass                            |
| Saved session is not initially treated as verified identity               | Pass; `01-saved-unverified.png`                                                                                                 |
| Native Check session verifies admin through UAT                           | Pass; `02-verified-admin.png`; same-session checkpoint                                                                          |
| Native Refresh session rotates and persists refresh token                 | Pass; `03-refreshed-admin.png`; checkpoint reported rotation, not just matching UI text                                         |
| Cold restart reads saved session but requires fresh identity verification | Pass; `04-restart-saved.png` → `05-restart-verified.png`; same session, same saved refresh token                                |
| Native Sign out clears local session and reports remote revocation        | Pass; `06-logged-out.png`; memory and SecureStore both checked                                                                  |
| WorkOS revocation and session isolation                                   | Pass; exact fixture session inactive, its latest saved refresh token returned invalid_grant, all prior active sessions retained |
| Independent formal CLI remains usable                                     | Pass; CLI whoami still verified the UAT administrator after App logout                                                          |
| Another cold restart stays signed out and retains trusted config          | Pass; `07-restart-signed-out.png`                                                                                               |

The first native Check session also rotated the API-prepared token before verifying identity; the explicit Refresh session then rotated it again. Cold restart restored that latest token without unexpected rotation. Issued access JWTs were **not** claimed to be instantly invalidated by logout; the remote assertion is session revocation and refresh rejection.

## Source and evidence boundaries

- Product runtime JS: `216963322c70c7ea009392da66e9a0e1f4327727`, the frozen shared batch. Product app/native inputs remain identical through driver commit `c12bc7936bd015f058d09b05d4ff3481c9e608a6`.
- Retained native build source: `a0b2919072af8fee62d8bb5fbb402fc52fb0d852`; previously verified executable SHA-256 `9afe634f14300fedd692f455eb2feaacdf07ba8d89e1777f5a0999a2f1afd753`. The intervening Settings build was never installed before this run.
- UAT service: `1ad3e6605a02965b3f9079f302ced02ca4a8f4c6`.
- Driver source: `c12bc7936bd015f058d09b05d4ff3481c9e608a6`. The local driver was refined during this run for pnpm dependency resolution, Hermes asynchronous evaluation, explicit Simulator target matching and same-fixture retry. Its final signed-out check passed; 18 focused driver/client tests, mobile typecheck, targeted lint/format passed. Earlier source baseline mobile suite was 550 pass / 8 skip; this report does not relabel that as a rerun at the final head.

`01-native-session.mp4` is a 105.9-second native recording: saved/unverified → checked → refreshed → cold restart → checked → signed out. Seven screenshots and the recording's 17-cell contact sheet were visually inspected before publication. Preparation, injection, auth forms, codes, tokens and personal account identifiers are absent. The Expo development overlay is visible. Images compare states in the same revision, not an older-code baseline.

One private temporary session was created for this run. The existing CLI session was independent. The temporary Magic Auth setting was restored, registration stayed closed, the fixture session was revoked, and its local credential file was removed after verification. The Simulator driver/recording were closed and the shared window returned; trusted config and app data were retained.

Still unqualified: Hosted AuthKit successful browser return/PKCE, physical-camera QR, Android, dark/large-text/VoiceOver and Human product acceptance. Earlier native browser-open/cancel checks remain separate. This evidence does not close TOB T1's remaining organization and permission slices.
