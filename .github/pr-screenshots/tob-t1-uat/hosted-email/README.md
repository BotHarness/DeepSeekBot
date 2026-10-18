# Real Hosted AuthKit email login — iOS Simulator UAT

Verified on 2026-10-18 (Asia/Tokyo), for DeepSeekBot #2101 / PR #2103 and TOB T1 #2.

## Identity and scope

- Product runtime: `216963322c70c7ea009392da66e9a0e1f4327727`.
- Retained native build source: `a0b2919072af8fee62d8bb5fbb402fc52fb0d852` (SDK58, iOS26 Simulator).
- UAT service: `1ad3e6605a02965b3f9079f302ced02ca4a8f4c6`.
- App language English, light appearance, default system text, 402 × 874 captures.
- No product code, cloud deployment, Prod configuration or role change in this run.

## What passed

1. Started signed out with the previously imported real UAT configuration and no emulator runtime adapter. The normal App **Sign in** action opened real Hosted AuthKit with its native S256 challenge/state and registered callback.
2. Temporarily enabled only Magic Auth in the verified WorkOS staging environment; registration remained closed. The hosted page sent the email code. After an automated input attempt was rejected, the page resent it and **the Human entered the new code directly in Device Hub**. The hosted browser returned to the App through the normal PKCE/state/code-exchange implementation; no injected API session or emulator token was used for this success.
3. The App showed **Signed in · Instance administrator**. Independent real UAT `/api/me` and WorkOS session readback matched the accepted bootstrap user, admitted administrator, exact trusted configuration and a fresh session absent from the baseline. The separate CLI session remained active.
4. **Refresh session** rotated the refresh token while preserving the same WorkOS session and admitted user.
5. Cold restart retained the saved session but displayed **Saved session · Check to verify**. **Check session** restored the same admitted administrator/session.
6. **Sign out** cleared App memory/SecureStore and reported remote revocation. WorkOS readback confirmed this session inactive; its latest rotated refresh token was rejected. The baseline CLI session remained active and the formal CLI `whoami` independently succeeded.
7. A second cold restart remained **Signed out** and retained public configuration.
8. Restored Magic Auth to disabled and read back `allowSignUp=false`, `isMagicAuthEnabled=false`. Closed the recorder/driver and released the shared Simulator window. No other session was revoked.

## Evidence

- `01-hosted-returned.png`: the admitted state after the actual hosted browser return.
- `02-refreshed.png`: refresh complete.
- `03-restart-unverified.png`: saved credentials after cold restart, before revalidation.
- `04-restart-verified.png`: same user/session verified again.
- `05-logged-out.png`: local cleanup and remote result shown in App.
- `06-restart-signed-out.png`: persistent signed-out state.
- `hosted-session.mp4`: 92-second post-login refresh/restart/logout/restart recording.
- `contact-sheet.png`: inspected 20-cell summary from 48 sampled frames.
- `results.json`: sanitized observed results; credentials and private session IDs are excluded.

All six screenshots were inspected. Credential entry and the browser callback URL were deliberately not recorded; the recording starts **after** successful authentication. This is observed Human-assisted real hosted acceptance, not a recording of the complete login form and not unattended hosted authentication.

## Failures and limits

The first local hidden-input attempt submitted six digits but Hosted AuthKit rejected the code. The initial helper did not compare every entered digit; cause is unconfirmed. A revised helper added comparison, but the Human completed the accepted retry directly, so automated hosted OTP entry remains unqualified. The Node module-format warning was unrelated to the login result. A temporary checkpoint initially compared unsorted JSON keys, and an immediate post-refresh check ran while the App was busy; stable configuration comparison and a post-completion readback resolved these diagnostic failures without changing the product.

This supersedes the earlier real-hosted pending note in `../browser/README.md` for the successful email/PKCE path only. Google login, physical QR/camera, Android, VoiceOver/theme/text matrix and remaining native failure scenarios are still separate gates. This run does not establish immediate invalidation of already-issued access JWTs. Broader T1 organization creation/list/switch, membership/permission, retries/reconciliation/revocation and final review remain open. No merge or T2 release.
