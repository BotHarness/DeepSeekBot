# Connect encrypted channel

## Mobile linked-computer management (#4039)

In the assigned native QA batch, sign in on the phone before pairing a Host. Use a disposable
account with five task-owned computers, including an offline target. Choose **Manage linked
computers**, cancel a named unlink once, then confirm it. Verify the target disappears, a new
computer registers, and the revoked session-bound Host cannot register after restart. Other
computers, local Bot content and phone pairings must remain intact. Check service-failure retry,
expired phone login and legacy removal warnings separately. Check English/Chinese, light/dark,
and default/intermediate/maximum system text on both platforms; record platform results separately.

The development-only `/qa/account-actions?scenario=linked-computers` route exercises the real
mobile account owner and panel with synthetic offline and legacy targets, never a live relay.
On iOS, tap the center and empty trailing area of each computer row as well as its label.
Use `scenario=linked-computers-refresh-failure` to confirm a synthetic unlink, observe a failed
list refresh with further removal disabled, then Refresh and verify recovery. Both routes retain
the `__DEV__` and `.dev` bundle gates; do not make them visible in production.
Source checks: `apps/mobile/test/account-panel-ios-integration.test.tsx`,
`apps/mobile/test/account-panel.test.tsx`, `apps/mobile/test/connect-account.test.ts`.
These checks do not establish native rendering or real-service acceptance.

## Sub-features

- Linked computers: Desktop/Web Bot settings → Connections → Manage → Tobs Connect loads the account list on entry,
  not on the three-second snapshot poll. Confirm sign-out of another computer; the current row has
  no revoke action. CLI: `connect-account-hosts` and `connect-account-revoke <host-id> --confirm`.
  At the five-link limit the unlinked current computer is explained without inventing a current row.
  Legacy unbound rows say Remove from account and warn they may reconnect.

## Linked-computer verification gate

Use only disposable, independently authorized Profiles on a designated test account. Refresh
their tokens privately, compare same account/distinct `sid`, revoke one session, and prove only
that Host retires its stored session while the control still refreshes. Never capture raw tokens or
session IDs. For the implemented relay route, verify tombstone-first refusal, current identification,
cancel without requests, explicit confirmation, slot recovery and no re-link after a watcher cycle.
`packages/connect-relay/test/connect-relay.test.ts`,
`packages/core/test/connect-account.test.ts`, `packages/core/test/cli-connect.test.ts` and
`packages/client/test/connect-account-hosts.test.tsx` cover the corresponding source boundaries.
Real Cloudflare/WorkOS, isolated Host/browser and production deploy are separate evidence gates;
local fixtures cannot qualify the deployment. Mobile remote sign-out is deliberately deferred.

## Encrypted channel sub-features

- Host fingerprint: Devices and `connect-status` expose one stable public identity across restart.
- Pairing: new phone/browser independently compares Host fingerprint; trusted Host approves the exact device key. No ordinary operation works while pending.
- Traffic: DM, image upload/download, avatar, approval, native private input, push registration and logical streams use the channel.
- Failure: changed/missing keys, replay, malformed frames, cancellation, revocation and reconnect fail closed without plaintext Connect fallback.
- Removal: full phone WebView remains absent; Connect Browser/Computer viewers remain unavailable.

## How to get to it (user POV)

Host Settings → Devices shows the Host fingerprint and pending device keys. Pair from the native phone or Add remote in another trusted Host's browser. Compare the complete Host fingerprint with the independent Host display, then compare and approve the device fingerprint on the Host. In chat, open a pending private-input request and choose Fill privately. Activity opens the same native form.

## Driving it with verify-app

Build and launch a named isolated Host with `verify-app`; run doctor with local network/process permissions. Use a second trusted browser Host for remote chat. Enable only a task-owned local connector or specifically authorized real tunnel. Qualify a real phone through the shared QA queue; a browser or Node carrier is not native proof. Use official DeepSeek credentials for a real DM and disposable private input.

Capture HTTP headers/URLs and WebSocket frames at the Connect origin before channel decryption. Compare synthetic sentinels with those bytes; preserve only redacted pass/fail summaries for publication. Read the owning Host's canonical timeline, approval outcome and private-input status. Verify `device-approve-key <receipt> <public-key> --confirm` and `connect-status` against this live Host. Restart the same isolated Profile and verify a stable fingerprint; reconnect must use new ephemeral keys. Revoke the device and verify open streams close.

## Native attachment regression

In the assigned native batch, choose a disposable image from the system picker and send it through Connect. Confirm its thumbnail and the owning Host attachment record, then verify its bytes/name are absent from the outer capture. The React Native Blob does not provide `arrayBuffer()`; the encrypted carrier reads its bytes with native FileReader. A browser Blob test alone does not qualify this path. Read errors and cancellation must send no application request and never retry through the raw carrier.

## Gotchas

- A Node socket mapped from a Connect hostname to a local origin qualifies the application carrier and native DSH dispatch, not Cloudflare reachability or native key storage.
- The mobile QA queue may be paused. Keep iOS/Android/Human checks explicitly unrun rather than claiming web-export pixels as native evidence.
- A browser served through an untrusted intermediary is outside the executable-code trust claim. Origin-local storage is not hardware protection.
- Never capture real credentials or private chats. Only synthetic test input belongs in published evidence.
- Protocol vectors and peer reviews do not constitute an external security audit.

## Account computer list and multiple additions (#2581)

In the shared device batch, open Pair a computer → DeepSeekBot account with two task-owned online Hosts A/B, one offline registration and one existing pairing. The account identity and Sign out/Delete account belong to one native section; computers to another. Offline and Added rows cannot be selected. No connection-name input appears. Keep all account emails and private runtime identifiers out of public evidence.

Select A/B and Add2: each must expose its own complete Host fingerprint for independent comparison, then its exact phone fingerprint for owner approval. Do not batch-approve keys. After A succeeds and B fails, A remains Added, B retains a specific retryable result. Retry B without re-adding A. Cancel or mismatch during one ceremony stops the remaining queue; Back/dismiss must not later open a stale verification. An alternate account registration returning an already-saved Host ID is refused before a new encrypted channel is opened; do not replace a saved pairing or its credentials.

After both succeed, both are Added, reopening the page prevents repeated selection, and Settings rename still changes only the phone-local name. Verify sign-out and failed/confirmed account deletion using a disposable QA account only; never delete the Human account for acceptance. Capture default/intermediate/maximum text × light/dark with actual native interactions; Android, physical devices and assistive technology stay separately untested until exercised.

## Mobile account computer identity (#3660)

In the assigned native QA batch, open the Computers environment picker with a saved Wi-Fi or
Tailscale computer and an unpaired task-owned account computer. Keep the two sections. On Android,
inspect the Material 3 `ListItem`; on iOS inspect both the drawer row and the environment page's
grouped form row. A long English or Chinese name occupies one line with a trailing ellipsis; its
complete accessible name remains available. The second line shows a green Online or red Offline
dot with matching localized text, not the Pair action. Saved computers also use yellow while
checking their connection.

Open More → Customize for the account computer, edit its local name and icon, save and reopen the
picker. The local identity must survive refresh/relaunch; the remote registration name must not
change. Pair through the existing independent fingerprint/approval ceremony: the same appearance
must follow the computer into the saved section, without duplicate rows or credential changes.
An already-customized saved computer wins over an older account-list appearance on re-pair.
Repeat at default/intermediate/maximum system text in light/dark, with narrow-screen ellipsis,
reachable More/Save, the actual keyboard, and full screen-reader names. Capture matched before/after
from the exact source heads; keep Android, iOS and Human acceptance separate.

Source regression controls: `apps/mobile/test/computer-row.test.tsx`,
`apps/mobile/test/host-look-screen.test.tsx` and `apps/mobile/test/host-look.test.tsx`.
These controls do not establish native text geometry, presented FPS, or real account-service QA.

## Connect account recovery (#3567)

This journey needs no model or production account. Build the selected revision and launch a named isolated Host with `verify-app`. For that launch only, set `NODE_OPTIONS=--import=<file-URL-of-scripts/fixtures/connect-account-recovery.mjs>`, `BOTHARNESS_CONNECT_QA_STATE=<absolute-private-JSON-path>` and `DEEPSEEKBOT_CONNECT_RELAY=https://connect-recovery.invalid`. Initialize the JSON with `{"mode":"tunnel-failure"}`. The preload replaces only this reserved relay and the two exact WorkOS device-flow endpoints with synthetic responses; it never creates a real tunnel or returns a runnable connector token. Do not use the fixture with an existing Human Profile.

Run the real `connect-sign-in --wait` CLI against that Host: synthetic authorization and registration succeed, tunnel provisioning returns 503, and `connect-status` exposes `account.issue=relay-unavailable` with `recovery=automatic`. The error remains visible even with no Cloud connections. Change only the fixture JSON `mode` to `ownership-failure`, retain its counters/registration, and sign in again. The owner must retain only the registration reference, report `recovery=sign-in`, and never silently resume the old account.

Open Bot settings → Connections → Manage. The first state explains automatic retry; the second tells the Human to sign in again later. `scripts/e2e-connect-account-recovery.mjs --name <n> --label <label> --expected automatic|sign-in --theme light|dark --locale en|zh` drives that real surface, compares the canonical API state, and saves a cropped Connect screenshot, accessibility tree and console evidence. `--expected legacy` is only for the pre-fix screenshot, where the same blocked state falsely promises automatic retry. Inspect and publish only the crop: the surrounding connection list can contain machine-specific network information.

For authorization recovery, reset fixture counters and set `mode=authorization-transient`, then sign in: the first device-token reply is HTTP 503 and the second succeeds; the original authorization flow stays active, no second device authorization is requested, and the subsequent synthetic tunnel failure has `recovery=automatic`. Unit regressions separately cover post-login register/tunnel retry without duplicate registration, explicit OAuth refusals, `slow_down`, timeout backoff and in-flight expiry/late-response rejection. These controlled failures do not identify the historical production incident or qualify real WorkOS/Cloudflare availability. Stop the task Host and its owned subprocesses using the cleanup runbook.

## Native email/password account access (#4017)

In the assigned iOS/Android device window, use a disposable WorkOS account and a relay advertising
`passwordAuth`. Open Settings → account → Sign in, or Pair a computer → Tobs account → Sign in.
The native form defaults to password and retains Apple/Google, email-code and hosted sign-in.
Use `email-sign-in-email`, `email-sign-in-password` and `email-sign-in-password-submit`.

Register through `email-sign-in-register`; require email verification before a session is saved.
Enter a wrong code, then the received code; observe the account identity and authenticated computer
list. Sign out, try a wrong password, then the correct password. Restart the app and confirm the
same identity and computer list. Test cancellation with a delayed response: no session may appear
later. Switch to email-code and back without retaining the password. With an older relay, require
the existing email-code entry instead of an unusable password form.

Use `email-sign-in-forgot` to request reset. Existing and absent accounts receive the same UI
acknowledgment; the reset link is delivered by WorkOS, never displayed by the relay. Follow the
email link in the system browser, set a new password, and verify old-password refusal and
new-password success with the same account. A privately retrieved Staging code/reset token proves
the API seam only, not email delivery or the hosted reset page. Unsupported MFA/organization
challenges must direct users to hosted sign-in without bypassing policy.

Exercise visible keyboards, password autofill, focus changes, scrolling and reachable submission
at default/intermediate/maximum system text in both themes on each platform. Capture matched
before/after form images without account identifiers or secrets. The reviewer gate additionally
requires the prepared verified account to pair its dedicated demo Host over a public network and
receive a real Bot reply. Keep API, simulator, physical-device, Android and Human results separate.

## Same-account Connect enrollment (#2734)

Sign in on a fresh phone with the Host's exact account and select that online Host. Expect connection without either a fingerprint comparison or Host-side phone approval, then send a real DM and correlate its reply with `send-status`. Preserve before/after evidence with source provenance. Reconnect and device revocation are separate checks. Wrong account/Host, expired or forged signed offers, signed-out state, invalid verifier, unsigned offers and LAN must not auto-approve. Run `account-enrollment.test.ts`, `connect-account.test.ts` and mobile account trust tests for these boundaries. Raw links cannot claim account-list trust. The account system and relay are trusted enrollment authorities under ADR-0327; do not claim compromised-relay enrollment resistance. Never place credentials in evidence.

## Client-driven account enrollment (#4178)

In the assigned physical-device window, use a task Host and authenticated staging Relay whose connector observation is offline and whose own Host probe is blocked. The phone's account sheet must still allow selecting that Host. Add it without fingerprint confirmation, then verify a newly created Channel from the owning Host. Interrupt the task connector, observe actual transport failure, restart it, and verify another newly created Channel after reconnect/relaunch. Directory presence or saved content alone is not success. Keep published app data and unrelated pairings intact.

The opt-in Relay offer returns signed authorization and the canonical HTTPS hostname without a Host fetch; the phone retrieves Device identity directly, then uses existing pinned Noise enrollment. CLI: `device-account-pair --account-file <private-session> --host-id <registration> --out <new-private-pairing> --confirm`, followed by `device-probe --device-file <private-pairing>`. Automated guards: mobile `connect-account.test.ts`, `account-hosts.test.tsx`, `account-pairing.test.ts`, core `cli-device-client.test.ts` and Relay `connect-relay.test.ts`. Staging, production deployment, iOS and Android acceptance are independent.

## Request-scoped DNS recovery and phone directory

For #4189, run `connect-check` against the isolated Host and retain whether `dnsRecovery: fresh-query` occurred. An official-host system miss with a valid configured-DNS answer must still verify TLS and the pinned Noise key; failed queries and wrong certificates/pins refuse. Verify actual `device-account-pair`/`device-probe` Feed, not merely the public GET. Label simulated lookup failures separately from real OS negative cache and default-network passes. Never reset global DNS/VPN from product code.

On native iOS/Android Workspace, unpaired account computer rows say Tap to connect even if service presence is false; allocation waiting stays distinct. Resume the open Workspace after changing the task account directory: rows refresh, failures keep same-owner cached rows plus ReadFailure details/retry. Sign-out/owner-read failure clears rows; responses after close/account change must not appear. Paired Host online state still comes from its actual client. Test public identity, encrypted channel and new Feed content separately. Original #4189 reporter reproduction remains separate from this controlled acceptance.
