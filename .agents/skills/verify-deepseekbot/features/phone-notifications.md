# Phone notifications and paired computers

The phone app keeps every paired computer and shows one. A push notification names the PersonaBot and what it needs, never the content; tapping it switches to its computer and opens the request. The app icon badge mirrors the unresolved requests of the shown computer, and banners for requests resolved elsewhere are removed ([ADR-0202](../../../../docs/adr/0202-phone-push-is-a-content-free-projection-of-the-human-inbox.md), [#1655](https://github.com/BotHarness/DeepSeekBot/issues/1655)).

## Sub-features

- `switch` changes the shown computer from the Home header (the "<name>, switch computer" button) or Me → Computers; the current row is selected ("Showing").
- `permission` shows Me → Notifications as off, denied (with "Open phone settings"), unavailable (a build without an EAS projectId), or on, with a switch per kind and "Send a test notification".
- `tap` routes a notification: a Tool approval or question opens the request (`/inbox/[id]`, or the card in the Bot's DM when the shown computer's Roster has that DM), a reply opens the DM, and a test or badge-only notification opens Activity. A notification for another computer switches first.
- `badge` sets the app badge to the shown computer's unresolved actions and dismisses banners for items no longer unresolved whenever the shown computer's Inbox changes.
- `register` stores one Expo push token per device on the Host (`/botharness-device/push/register`); revoking the device deletes it, and the Host log records `push phase=…` lines without the token.

## How to get to it (user POV)

- Phone: pair a second computer from Me → Computers → "Pair a new computer"; switch from the Home header. Me → Notifications holds the permission state, the switches and the test button.
- Notification: approve a Tool call by tapping the banner, then Allow once.

## Driving it with verify-app

- **Native app (Mac, default).** `node scripts/e2e-mobile-sim.mjs` creates its own Simulator, starts Metro on a free port, builds and installs the development build, launches two isolated Hosts (Mac A with Ada, Mac B with Bea), pairs with both by deep link, checks Me → Notifications, switches computers both ways, makes Ada ask for a real Tool approval, taps its notification while Mac B is shown, taps Allow once and checks the command ran, then taps a test and a badge-only notification. It prints JSON with `"result":"pass"`; screenshots and Maestro output go to `.humanlayer/verify/mobile-sim/evidence/`. `--app <path.app>` installs an existing build instead of building (the first run prints the path), `--no-approval` skips the model step, `--keep` leaves the Simulator, Metro and Hosts running, `--device <name>` picks another iPhone. The flows are in `apps/mobile/.maestro/sim/`.
- **Host side.** `apps/mobile/test/push.test.ts` and `packages/core/test/push-delivery.test.ts` cover registration, preferences, the content-free payload, receipts and revoke. By hand: redeem an offer at `/botharness-device/pair`, `POST /botharness-device/push/register` with `{"token":"ExponentPushToken[…]","platform":"ios","locale":"en"}` and the `Authorization: Device …` header, revoke the device, then check `push_devices` in `<home>/botharness/botharness.db` and the `push` rows in `<home>/botharness/logs.db`.

## Gotchas

- The Simulator cannot get an Expo push token without an EAS projectId, so Notifications shows "This build of the app cannot receive notifications." and the per-kind switches and test button do not appear. Real APNs/FCM delivery needs a physical device and EAS credentials; say it is still owed.
- `xcrun simctl push` stands in for the Expo push service. The notification data goes under the payload's `body` key, which is where expo-notifications reads it on iOS.
- The banner belongs to SpringBoard, so Maestro cannot find it by text: the flow taps it by point (top centre). agent-device can tap it the same way (`press 196 90` on an iPhone 16).
- `maestro test` blocks while it runs; the journey serves its push trigger from the same process, so it runs Maestro asynchronously.
- Both isolated Hosts report this Mac's name. The journey renames them to Mac A and Mac B in the pairing link, which only changes the name the phone shows.
- Keychain entries survive an app reinstall on the same Simulator, so a reinstalled app can still be paired. The journey uses a fresh Simulator every run.
- The Host writes an item's summary in the computer's language, so a Chinese Mac shows "请求批准执行 bash" in an English app.
- Maestro grants every permission on `launchApp` by default, so the notification prompt does not appear in the journey. To see the denied state, launch with `permissions: { all: unset }` and tap Don't Allow.
- A Maestro step can outlast a Host's keep-alive timeout, so the journey's next `fetch` may write to a closed pooled socket (`EPIPE`); it retries a Host call once.
- A run needs several GB free: the development build (about 2.5 GB in DerivedData), a fresh Simulator and Metro's cache. With a full disk `xcodebuild` fails with unrelated-looking compile errors before it says "No space left on device". Maestro's debug output stays in the evidence folder, which each run replaces.
