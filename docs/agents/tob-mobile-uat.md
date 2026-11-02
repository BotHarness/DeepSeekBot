# TOB mobile UAT verification

Scope: [#2101](https://github.com/BotHarness/DeepSeekBot/issues/2101), [TOB T1](https://github.com/BotHarness/tob/issues/2). This is a separate no-Host path. Do not start T2 or change Prod.

## Before the phone run

1. Follow [shared device QA](device-qa.md), obtain the assigned native build/phone window and recheck free disk. New native modules and URL scheme require an SDK58 development binary. Preserve the old app/Keychain/Host state; no erase is required.
2. Deploy the TOB mobile-discovery companion to UAT, read back the exact callback and fixed instance fields, then export public JSON and render its QR using [TOB's operator tools](https://github.com/BotHarness/tob/blob/main/docs/t1-mobile-session.md). Configuration changes require reimport on the CLI too.
3. Record app build/source SHA and UAT service SHA separately. Human authentication occurs only in WorkOS; never capture password, OTP, authorization code or tokens in evidence. Keep a separate CLI session for the isolation check.

## Observable path

- From an unpaired launch, open **Cloud services** on the pairing screen. A paired user reaches the same screen from the Host drawer. Host pairing/active Host stays unchanged.
- Scan the trusted operator QR, or use **Paste configuration** with the same complete public JSON. On Simulator, pasted import validates the real UI and session path; it does not qualify physical camera scanning. Check server/instance/UAT and confirm import. An ordinary URL, wrong callback or malformed QR is refused without credential exchange. Deny camera permission and verify the retry/settings path.
- Tap **Sign in**. Human completes WorkOS login in the system browser. Return to the app; only the initialized admin is admitted. Screenshot the resulting status with unrelated/private data cropped.
- Tap **Refresh session** and **Check session**. Verify the same admitted identity. Cold restart restores a saved session but requires verification before showing the signed-in status.
- Tap **Sign out**. Confirm local removal and reported remote result; independently read back the WorkOS session, confirm the separate CLI session still works. Do not claim already-issued access JWTs are immediately invalidated.
- Repeat cancellation, expired/interrupted browser flow and offline logout. A cold OAuth callback must not create a login or leak query parameters into navigation. Offline logout reports local-only cleanup; a remote session may remain until revoked/expired.
- With operator-produced replacement config, show critical differences and require explicit confirmation; changed discovery refuses credential-bearing requests. Do not point credentials at arbitrary test servers.
- Capture default/intermediate/maximum system text × light/dark. Scroll to all actions and verify VoiceOver labels/reading order. Camera stops when leaving the screen. Android is a separate qualification lane.

Source tests simulate storage failures, state mismatches, rotation errors and concurrency. Native failure injection is additional evidence when feasible, not an automatic pass. This slice does not expose organizations/groups yet. T1 remains open for shared phone/CLI organization creation/list/switch, owner/member/create retry, signed identity events/reconciliation, revocation and complete Human QA.

## Unattended native session tests (UAT only)

WorkOS [recommends API-prepared sessions for real staging tests](https://workos.com/docs/authkit/testing), and its emulator for automated login-page/callback tests. These are distinct evidence categories. An injected real session **does not** qualify Hosted AuthKit, native PKCE exchange, browser return, Google login or physical QR capture.

The local scripts below run outside the app bundle. They add no app route, global auth hook, release-build flag or server authorization bypass. The debugger can already execute code in a development app: treat its connection and the private fixture file as credentials. Never expose Metro's inspector to an untrusted network.

1. Reserve the assigned Simulator and freeze source/native/service identities. Keep an independently authenticated CLI session. Import the operator's public UAT config through the normal UI first; leave this cloud entry signed out.
2. The operator profile contains private `uat-target.json`, `bootstrap-target.json`, `tob-instance.json` and `secrets.env`. Directories must be user-owned 0700 and files 0600; symlinks are refused. It must refer to the previously verified WorkOS staging environment and accepted bootstrap invitation. No script creates users, changes the initialized administrator or changes WorkOS settings. If Magic Auth is disabled, an operator may temporarily enable only that setting, record its previous value, and restore it after session preparation. Registration stays closed.
3. Create a fresh private run directory through the preparation command (its parent already exists). This sends one OTP email through WorkOS, consumes the API-returned code automatically, validates admission through the real UAT `/api/me`, and saves a separate temporary session. The API key and OTP never enter the app, output or run file. This T1 fixture uses the existing authorized UAT administrator; future repeated suites should use an isolated test instance and identity once its admission lifecycle exists.

```sh
node apps/mobile/scripts/tob-uat-session.mjs prepare --profile "$PRIVATE_OPERATOR_PROFILE" --run "$NEW_PRIVATE_RUN"
```

4. Read the assigned Metro's `/json/list`, identify the exact Simulator/app debugger target, and pass that target explicitly. The driver requires a booted assigned Simulator, a loopback inspector, a development runtime, an already-imported matching UAT config, no active cloud operation and no existing session. It writes only the selected cloud entry through the existing SecureStore adapter. It preserves other cloud entries and Host state; cold-restart the app afterwards.

```sh
node apps/mobile/scripts/tob-mobile-driver.mjs inject --session "$NEW_PRIVATE_RUN/session.json" --simulator "$ASSIGNED_SIMULATOR" --metro "$ASSIGNED_METRO_PORT" --target "$INSPECTOR_TARGET"
```

5. Use native UI **Check session** to obtain the service-verified identity, **Refresh session**, cold restart and **Check session** again. After each step, `checkpoint` (same driver arguments) checks the admitted identity/session and saves the latest rotated credentials privately. It prints only booleans, including whether refresh changed since the previous checkpoint. Re-read the inspector target after each restart. Seeded storage alone cannot pass a checkpoint.
6. Tap **Sign out**. Run driver `signed-out` to check both memory and SecureStore have no session while public config remains. Run the operator script `verify-logout` with the same profile/run arguments: the exact WorkOS session must be inactive, its latest saved refresh token rejected, and every baseline active session still active. Independently run the formal CLI `whoami`. Cold restart once more and verify signed-out persists.
7. On interruption, run operator `cleanup` to revoke only the fixture's session; clear it through App Sign out before retrying. Retain private records only until revocation is confirmed, then remove the task-owned run file. Do not delete other sessions or shared app data. Restore any temporarily enabled Magic Auth setting even if testing fails.

Capture only post-login UI states; stop recording during preparation/injection. Screenshots and recordings must omit identities, tokens and debugger payloads. Record source checks, API authentication, native lifecycle, hosted browser flow and Human acceptance separately.

## Native browser callback regression (local emulator)

`apps/mobile/scripts/tob-authkit-browser.mjs` exercises the existing `CloudClient.login`, Expo Crypto and `WebBrowser.openAuthSessionAsync` in the assigned development Simulator. It replaces only that process's runtime adapters through its privileged loopback debugger; all session writes stay in memory. The screen is explicitly named **LOCAL EMULATOR - not UAT**. No fixture endpoint, switch or test identity ships in the app, and no emulator token is sent to WorkOS or TOB UAT.

Install the pinned official emulator outside the repository, then start the local fixture:

```bash
npm install --prefix /tmp/tob-authkit-tools --no-audit --no-fund @workos/emulate@0.15.0
node apps/mobile/scripts/tob-authkit-browser.mjs serve \
  --emulator /tmp/tob-authkit-tools/node_modules/@workos/emulate/dist/index.js \
  --info /tmp/tob-browser-fixture-info.json
```

After receiving the shared Simulator window, open Cloud services with no active cloud session. Discover the exact **Simulator** inspector target after each reload; a phone may appear on the same Metro. Use the existing driver flags `--simulator`, `--metro` and `--target`:

1. Run `install --info /tmp/tob-browser-fixture-info.json` with those flags. Installation refuses release builds, busy clients, existing sessions and non-UAT saved configs. No SecureStore write occurs.
2. Press **Sign in**. The real iOS system browser displays **WORKOS EMULATE** with the fictional email prefilled. Dismiss the keyboard before pressing **Continue** if it covers the button. The browser returns via the app's existing custom scheme; the normal client validates state and exchanges the code with its real native S256 verifier. The local fixture validates the emulator signature before returning a fictional administrator identity.
3. `status` returns only bounded booleans/error codes. GET the info file's loopback `url` + `/__fixture/status` for exchange status, S256 match, absence of client secret and rejected authorization-code replay. Never print a browser callback URL or token response.
4. `restore` returns the original runtime, vault and identities without writing storage. POST the literal `wrong-state` or `wrong-verifier` to the loopback `/__fixture/scenario`, reinstall and repeat. Wrong state must fail with `INVALID_CALLBACK` before any token request; a changed verifier must yield HTTP 400 and native `LOGIN_FAILED`, with no local session.
5. Restore after every scenario, close the recorder/driver and stop only the task-owned fixture process. Cold reload is the fallback if interrupted: adapters and fixture storage exist only in memory. Verify the real UAT configuration is retained and signed out before releasing the window.

The fixture's successful state is not evidence of real TOB admission. WorkOS Emulate 0.15.0 refuses the hostless RFC 8252 callback spelling used by this app, so the loopback adapter gives it an HTTP callback and translates the returned Location to the unchanged native callback. Therefore this regression proves native browser handoff, client state checks and S256 exchange against the emulator; it does **not** prove WorkOS's registered redirect enforcement, live Radar/IdP behavior, or real hosted authentication. The existing real-UAT session tests remain a separate layer. See [WorkOS testing guidance](https://workos.com/docs/authkit/testing) and the emulator's [redirect policy](https://github.com/workos/emulate/blob/main/src/workos/helpers.ts).

## Real hosted email acceptance (2026-10-18)

The normal Hosted AuthKit → native PKCE/state callback → real UAT administrator path passed with a Human entering the page-sent email code in the assigned Simulator. The subsequent refresh rotation, cold restart and revalidation, own-session logout, remote revocation/latest-refresh refusal and independent CLI isolation all passed. Magic Auth was temporarily enabled only for this staging run, then restored disabled; registration remained closed. See the [captured report](../../.github/pr-screenshots/tob-t1-uat/hosted-email/README.md).

A hidden terminal input helper was attempted, but the first code was rejected and the successful retry was entered by the Human. Do not treat that helper as qualified unattended hosted authentication. Never substitute an API-generated code for a code sent by the active hosted page without proving that transaction. Keep credentials out of recordings; the published video starts after login. Local emulator browser regression and API-prepared real-session automation remain the routine unattended layers.

## Organization slice (#2120)

Source: Cloud services → Cloud workspaces → create a synthetic workspace → select it → save a description. Independently use the TOB CLI `org list`, `org use --id`, and `org show`; compare exact organization ID, description and version. Create a second test workspace through CLI and switch both clients independently. Reuse original request keys after uncertain creation; do not start another request blindly.

Through the verified UAT control plane only, change the first test organization's membership owner → member while preserving the stale owner access token. The existing token must fail description updates; mobile Check session must display Member and read-only settings. Inactive membership must disappear from lists and deny access despite instance admin. Restore owner and read back. This controlled fixture does not add a product role-management API or admit another user.

Capture real UI before creation, owner selected, member read-only, restored owner and cross-client readback. Record mobile/Worker SHAs, independent auth sessions and restored WorkOS settings. API-prepared authentication does not re-prove Hosted AuthKit, which has its separate #2103 evidence. Only assigned Simulator/Metro/build lane; preserve physical phone and other Hosts. UAT only; no merge.

### Organization slice outcome (2026-10-18)

See `.github/pr-screenshots/tob-t1-organizations/README.md` for exact runtimes and native evidence. One organization was created on the phone and independently selected/read by the formal CLI. Live owner → member → owner checks passed without changing the instance administrator. Stale-owner writes were denied; the native rerun also verified discarded unsaved drafts and refreshed role labels. Optional second-organization creation and membership deactivation were rejected by automatic approval review and did not execute.

For Simulator SecureStore checks, preserve normal local ad-hoc code signing. The initial `CODE_SIGNING_ALLOWED=NO` build produced a Keychain error; a signed incremental build resolved it without erasing app data. This was a test-build issue, not an authentication bypass. Current screenshots use per-process English launch options; global Simulator language preferences remain unchanged.

## Ordinary-user workspace continuation — #2130 / #2131

The earlier administrator-only acceptance scope is superseded when TOB authenticated-user policy is enabled. On 2026-10-18, runtime 9f71dd3d9 passed ordinary-user default-workspace replay, actual UI creation/selection of a third organization, independent CLI exact-ID agreement, cold restart, refresh and isolated logout on the shared Simulator. See [captures and limits](../../.github/pr-screenshots/tob-multi-user/README.md). This uses the synthetic UAT session driver, not a new Hosted AuthKit test. No physical-device or Human acceptance is claimed.
