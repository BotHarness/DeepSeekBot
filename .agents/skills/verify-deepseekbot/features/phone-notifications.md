# Phone notifications and paired computers

The phone app keeps every paired computer and shows one. A push notification is titled with the Channel (`#name`, or the PersonaBot's name for its DM) and its body says what the PersonaBot needs plus a short preview of the command, question or message; private input requests show no content ([ADR-0213](../../../../docs/adr/0213-phone-push-shows-the-channel-and-a-short-preview.md)). Tapping it switches to its computer and opens the request. A Tool approval notification also has Allow once and Reject buttons (long-press on iOS, expand on Android); either one unlocks the phone, opens the app, sends the decision and shows the card already decided. The app icon badge mirrors the unresolved requests of the shown computer, and banners for requests resolved elsewhere are removed ([ADR-0202](../../../../docs/adr/0202-phone-push-is-a-content-free-projection-of-the-human-inbox.md), [#1655](https://github.com/BotHarness/DeepSeekBot/issues/1655)).

## Sub-features

- `switch` changes the shown computer in the Host drawer, opened from the Chats header (the "<name>, switch computer" button), a swipe from the left edge of Chats or Activity, or Settings (the avatar at the top right of Chats) → Computers; the current row is selected ("<name>, Showing, …").
- `permission` shows Settings → Notifications as off, denied (with "Open phone settings"), unavailable (a build without an EAS projectId), or on, with a switch per kind and "Send a test notification".
- `tap` routes a notification: a Tool approval or question opens the request (`/inbox/[id]`, or the card in the Bot's DM when the shown computer's Roster has that DM), a reply opens the DM, and a test or badge-only notification opens Activity. A notification for another computer switches first.
- `badge` sets the app badge to the shown computer's unresolved actions and dismisses banners for items no longer unresolved whenever the shown computer's Inbox changes.
- `register` stores one Expo push token per device on the Host (`/botharness-device/push/register`); revoking the device deletes it, and the Host log records `push phase=…` lines without the token.

## How to get to it (user POV)

- Phone: pair a second computer from the Host drawer's "Pair a new computer"; switch from the same drawer. Settings → Notifications holds the permission state, the switches and the test button.
- Notification: approve a Tool call by tapping the banner, then Allow once.

## Driving it with verify-app

- **Native app (Mac, default).** `node scripts/e2e-mobile-sim.mjs` erases its own `BotHarness e2e` Simulator (creating it once), starts Metro on a free port, installs the development build cached under `~/Library/Caches/botharness/mobile-sim/` (building it only when the native fingerprint of `apps/mobile` changes), launches two isolated Hosts (Mac A with Ada, Mac B with Bea), pairs with both by deep link, checks Settings → Notifications, switches computers both ways, makes Ada ask for a real Tool approval, taps its notification while Mac B is shown, taps Allow once and checks the command ran, then taps a test and a badge-only notification. It prints JSON with `"result":"pass"`; screenshots and Maestro output go to `.humanlayer/verify/mobile-sim/evidence/`. `--app <path.app>` installs a specific build, `--no-approval` skips the model step, `--keep` leaves the Simulator, Metro and Hosts running, `--device <name>` picks another iPhone. The flows are in `apps/mobile/.maestro/sim/`.
- **Host side.** `apps/mobile/test/push.test.ts` and `packages/core/test/push-delivery.test.ts` cover registration, preferences, the title and preview payload, receipts and revoke. By hand: redeem an offer at `/botharness-device/pair`, `POST /botharness-device/push/register` with `{"token":"ExponentPushToken[…]","platform":"ios","locale":"en"}` and the `Authorization: Device …` header, revoke the device, then check `push_devices` in `<home>/botharness/botharness.db` and the `push` rows in `<home>/botharness/logs.db`.

## Gotchas

- The Simulator cannot get an Expo push token without an EAS projectId, so Notifications shows "This build of the app cannot receive notifications." and the per-kind switches and test button do not appear. Real APNs/FCM delivery needs a physical device and EAS credentials; say it is still owed.
- `xcrun simctl push` stands in for the Expo push service. The notification data goes under the payload's `body` key, which is where expo-notifications reads it on iOS.
- The banner belongs to SpringBoard, so Maestro cannot find it by text: the flow taps it by point (top centre). agent-device can tap it the same way (`press 196 90` on an iPhone 16).
- `maestro test` blocks while it runs; the journey serves its push trigger from the same process, so it runs Maestro asynchronously.
- Both isolated Hosts report this Mac's name. The journey renames them to Mac A and Mac B in the pairing link, which only changes the name the phone shows.
- Keychain entries survive an app reinstall on the same Simulator, so a reinstalled app can still be paired. The journey erases its Simulator at the start of every run.
- The Host writes an item's summary in the computer's language, so a Chinese Mac shows "请求批准执行 bash" in an English app.
- Maestro grants every permission on `launchApp` by default, so the notification prompt does not appear in the journey. To see the denied state, launch with `permissions: { all: unset }` and tap Don't Allow.
- A Maestro step can outlast a Host's keep-alive timeout, so the journey's next `fetch` may write to a closed pooled socket (`EPIPE`); it retries a Host call once.
- A run that has to build needs several GB free: DerivedData (about 2.5 GB, deleted once the `.app` is cached), the Pods in `apps/mobile/ios` and Metro's cache. A run that reuses the cached `.app` needs only the Simulator and Metro's cache. Do not run it from a new worktree: each one adds its own `node_modules` and Pods. With a full disk `xcodebuild` fails with unrelated-looking compile errors before it says "No space left on device". Maestro's debug output stays in the evidence folder, which each run replaces.
