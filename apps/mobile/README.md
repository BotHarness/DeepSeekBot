# DeepSeekBot mobile app

Native Expo client for the Human's own Host (hub [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), spec [#1645](https://github.com/BotHarness/DeepSeekBot/issues/1645)). The app pairs with a Host by scanning the QR code from the Web Client ([#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652)) and shows the Roster of PersonaBots and group Channels with live state.

Pairing gives the phone a per-device credential, kept only in Keychain/Keystore. The app sends it as `Authorization: Device …` to the BotHarness device gateway (`/botharness-device/…`), which forwards the same unary envelope and mux frames to the Host ([ADR-0199](../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)). The phone never holds a DSH token or cookie, keeps working across Host restarts, and is cut off at once when the Human revokes it.

## Layout

- `src/host/` — the Host client module. One deep module owns the routes, the device credential, unary calls, the Remote stream socket, reconnection and connection state. Screens read it through `useHostSnapshot()` and never talk HTTP. It is plain TypeScript with an injected carrier (`carrier.ts`), so it is tested in Node.
- `src/host/wire.ts` — the slice of the Host's wire shapes the app reads; `test/wire-contract.ts` checks the Host's own types against it in the root typecheck.
- `src/host/pairing.ts` — reads the pairing link (QR code or `deepseekbot://pair?p=…`) and redeems its one-time offer through the first route that answers.
- `app/` — Expo Router screens: two tabs, the Roster (`(tabs)/index.tsx`) and the Human Inbox (`(tabs)/inbox.tsx`); a Bot DM (`dm/[slug].tsx`) and a group Channel (`channel/[id].tsx`), both drawn by `src/ui/chat/conversation-screen.tsx`; an Inbox item (`inbox/[id].tsx`); and pairing (`pair.tsx`, camera scan or pasted link).
- `src/host/inbox.ts`, `src/host/requests.ts` — the Human Inbox ([#1653](https://github.com/BotHarness/DeepSeekBot/issues/1653)). The list is the Host's `humanAttention` (actions, then mentions and replies, then handled), re-read whenever the live Roster or Activity stream changes; the app keeps no Inbox store. Tool approvals and Human questions are read with `channelTimeline` plus `toolApprovalStatus` / `userQuestionStatus` and decided with `toolApprovalDecide` / `userQuestionAnswer`, the methods the Web Client and the live CLI verbs call. The first accepted decision wins; a late one comes back as "already decided" or "expired". Private input opens in the full client.
- `src/host/conversation.ts` — one Human–PersonaBot DM ([#1651](https://github.com/BotHarness/DeepSeekBot/issues/1651)): it follows `botharness/followChannel` on the shared socket, keeps one contiguous window of Channel revisions, repairs a gap and pages older history with `channelJournalPage` (ADR-0179), and sends with `channelSend` and a `human-<uuid>` id made on the phone, so a retry is idempotent (ADR-0159). Bot drafts arrive as notifications and are replaced by the committed reply. `native-cache.ts` keeps the last page per Bot for the first paint; unpairing deletes it.
- `src/host/hosts.ts`, `src/host/push*.ts`, `src/host/native-notifications.ts` — paired Hosts and push notifications ([#1655](https://github.com/BotHarness/DeepSeekBot/issues/1655), [ADR-0202](../../docs/adr/0202-phone-push-is-a-content-free-projection-of-the-human-inbox.md)). The app keeps every paired Host and shows one; the Host switcher (`hosts.tsx`) lists them. After pairing it asks for notification permission and registers its Expo push token with each Host through `/botharness-device/push`. A tapped notification switches to its Host and opens the item. `notifications.tsx` turns kinds on or off and sends a test.
- `src/ui/markdown.ts` — a small Markdown reader for replies, drawn with native selectable Text by `markdown-view.tsx`.
- `src/ui/` — native views. Pixel avatars are drawn from the Host's own avatar code (`packages/core/src/bots/avatar-appearance.ts`), so they match the Web Client.

Carrier decision and evidence: [ADR-0200](../../docs/adr/0200-the-mobile-app-reads-live-state-over-the-dsh-remote-stream-socket.md).

## Toolchain

Expo SDK 57 (React Native 0.86, React 19.2) inside the pnpm workspace with pnpm's default isolated linker: no `node-linker=hoisted`, no `.npmrc` change. `metro.config.js` adds one resolver rule so Metro can follow the Host sources' `.js`-suffixed TypeScript imports. Having React Native in the workspace makes pnpm link it as an optional peer of a few web packages (`morphicons`, `@tanstack/charts`); those packages only load it from their explicit React Native entry points.

```bash
pnpm install
pnpm --filter @botharness/mobile typecheck
pnpm vitest run apps/mobile                     # Host client, Inbox and screens against recorded Host frames
MOBILE_LIVE_HOST_URL='http://127.0.0.1:<port>/?token=<token>' pnpm vitest run apps/mobile
                                                # also pairs with a live isolated Host and drives it there: a real PersonaBot
                                                # asks for a Tool approval and a Human question, and the app's modules decide them;
                                                # a real DM reply plus resume (creates a PersonaBot if none)
pnpm --filter @botharness/mobile export          # Metro bundles for iOS and Android
```

## Full client in the app

Every native screen can offer "Open full client" (`src/ui/open-full-client.tsx`), which opens `app/full-client.tsx` as a full-screen modal with no header bar; a draggable floating exit button (`src/ui/floating-exit.tsx`) that snaps to either side edge leaves it, and holding it shows an "Exit web mode" tooltip. It loads `<route>/botharness-device/web/` in a WebView on the route the native screens are using and sends the device credential as a header only on that first load; the Host answers with a session cookie scoped to that directory ([ADR-0199](../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md#full-web-client-in-the-app-1654)). The target (`home`, a PersonaBot DM, or a private input request) becomes a hash the Web Client reads to land there. Links that leave the Host's web directory open in the system browser. When the Host refuses the device, the modal shows "Pair again" instead of the page. `react-native-webview` is native code, so a development build made before this change must be rebuilt.

## Drive it on the iOS Simulator (Mac)

Agents verify native UI on a Mac with Xcode: they drive a development build on the iOS Simulator with Callstack's [agent-device](https://github.com/callstack/agent-device) (Node ≥ 22.12, run with `npx`), and keep regression flows for [Maestro](https://maestro.mobile.dev) in `.maestro/`. Cloud sessions reach the Mac through Remote Control.

1. **Build and serve.** Boot a simulator, build the development build onto it, and start Metro:

   ```bash
   xcrun simctl boot <udid>                          # xcrun simctl list devices available
   LANG=en_US.UTF-8 pnpm --filter @botharness/mobile ios -- --device <udid> --no-bundler
   pnpm --filter @botharness/mobile start
   ```

   CocoaPods needs a UTF-8 locale; without one `pod install` crashes in its error report and Xcode then fails with "The sandbox is not in sync with the Podfile.lock". When Xcode ships without `Simulator.app`, `expo run:ios` installs the app and then fails to bring the Simulator window forward; the build is still usable.

2. **Drive it with agent-device.** Open the app on Metro, read the accessibility snapshot, act by ref, and check the result:

   ```bash
   npx agent-device open ai.botharness.deepseekbot.dev --platform ios --relaunch \
     --launch-url "exp+deepseekbot://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
   npx agent-device snapshot -i                      # @e8 [text-field] "deepseekbot://pair?p=…" …
   npx agent-device fill @e8 "not-a-link" --settle   # the link field's ref from the snapshot
   npx agent-device press 'label="Pair"' --settle
   npx agent-device wait text "This is not a DeepSeekBot pairing code."
   npx agent-device screenshot /tmp/pair.png
   npx agent-device close
   ```

   iOS asks "Open in DeepSeekBot Dev?" before the launch link. agent-device accepts it only when the Simulator is in English; otherwise `snapshot -i` shows the alert and you press its Open button by ref. The first launch after a reset shows the dev menu onboarding: press **Continue**, then **Close**.

3. **Regression flows.** `.maestro/pair-screen.yaml` launches a clean app with no permissions, connects it to Metro, checks the unpaired pair screen and the refusal of a bad pasted link. Maestro needs Java 17 or later (`brew install openjdk@21`, then point `JAVA_HOME` at it):

   ```bash
   curl -fsSL "https://get.maestro.mobile.dev" | bash   # once
   pnpm --filter @botharness/mobile e2e:ios             # maestro test --platform ios .maestro
   ```

   Maestro grants every permission on `launchApp` unless the flow says otherwise; the flow sets `permissions: { all: unset }` so the camera prompt shows as on a first launch. Run output and screenshots go to `~/.maestro/tests/<timestamp>/`.

   Screens behind pairing need a live Host, and an Inbox request needs a real model turn. Step 4 runs the paired flows in `.maestro/sim/`; drive any other screen (DMs, Inbox questions) with agent-device. Launch an isolated Host (`node scripts/verify-app.mjs launch --name <n>`), ask it for a pairing offer, point the link's `routes` at the Host's loopback origin (the Simulator shares the Mac's network, and the development build allows local HTTP), paste the link on the pair screen, then make a PersonaBot ask with `ask_user_question` through `channelSend`. `scripts/e2e-mobile-pairing-web.mjs` shows the offer and route rewrite.

4. **Everything with live Hosts, in one command.** `node scripts/e2e-mobile-sim.mjs` uses one Simulator of its own named `BotHarness e2e`, erased at the start of each run so earlier pairings in the Keychain do not leak in, and its own Metro port. It builds the development build only when the native fingerprint of `apps/mobile` changes (a native package, `app.json` or a config plugin); otherwise it installs the `.app` cached in `~/Library/Caches/botharness/mobile-sim/` and loads the current JavaScript from Metro. After a build it keeps one copy of the `.app` there and deletes that build's DerivedData folder. It launches two isolated Hosts, pairs with both by deep link, switches computers, makes a PersonaBot ask for a real Tool approval and opens it from a notification. It prints `"result":"pass"` and keeps screenshots and Maestro output in `.humanlayer/verify/mobile-sim/evidence/`. Pass `--app <path.app>` to install a specific build, `--no-approval` to skip the step that needs a model, and `--keep` to leave everything running. Its flows are in `.maestro/sim/` and take their values as `-e` variables. Feature map: [phone-notifications.md](../../.agents/skills/verify-deepseekbot/features/phone-notifications.md).

5. **Notifications without APNs.** `xcrun simctl push <udid> ai.botharness.deepseekbot.dev payload.apns` delivers a notification as the Expo push service would. expo-notifications reads the data from the `body` key:

   ```json
   {
     "Simulator Target Bundle": "ai.botharness.deepseekbot.dev",
     "aps": {
       "alert": { "title": "Ada", "body": "Ada needs your approval" },
       "sound": "default",
       "badge": 1
     },
     "body": {
       "v": 1,
       "hostId": "<host id from the pairing link>",
       "itemId": "approval:<id>",
       "kind": "tool-approval",
       "botSlug": "<slug>",
       "channelId": "dm-<slug>",
       "messageId": "<message id>"
     }
   }
   ```

   A test notification sends `{ "v": 1, "hostId": "…", "test": true }`, and a badge-only one sends `{ "v": 1, "hostId": "…" }` with `aps.badge`; both open Activity. The banner belongs to SpringBoard, so neither Maestro nor agent-device finds it by text: tap it by point while it shows, for example `npx agent-device press 196 90` on an iPhone 16, or `tapOn: { point: 50%,10% }` in a flow. For the home-screen badge and Notification Center, go home (`npx agent-device home`) and take `xcrun simctl io <udid> screenshot`. The Simulator cannot get an Expo push token without an EAS projectId, so Settings → Notifications says this build cannot receive notifications.

6. **MCP.** Agents that prefer tools over a shell can use `npx agent-device mcp` (stdio; tools mirror the CLI commands) or `maestro mcp` (stdio; runs flows and inspects the view hierarchy). [XcodeBuildMCP](https://github.com/getsentry/XcodeBuildMCP) is an alternative for building and driving the Simulator from Xcode's side.

## Screenshots without a phone

Native checks happen on a Mac (above). Cloud sessions have no simulator: the container has no KVM for the Android emulator, no macOS for the iOS simulator, and the egress policy blocks `expo.dev`, so EAS cannot be driven from there; they reach a Mac through Remote Control for native checks. For PR evidence they render the same screens through React Native Web and screenshot them at a 390 × 844 phone viewport:

```bash
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export:web
python3 -m http.server 8099 --directory apps/mobile/dist-web &
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-light.png light
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-dark.png dark
```

The web render is layout evidence, not native evidence: it shows the app's own views, copy, spacing and theme, but not native headers, large titles, keyboard behavior or fonts. `expo-secure-store` has no web backend, so the web build keeps the paired Host in the tab's `sessionStorage` instead (`src/host/saved-host.web.ts`), and the camera scanner only runs on a native build; paste the pairing link instead. To render screens with live data, serve `dist-web` from the Host's own origin (a small reverse proxy that forwards `/botharness-device/*` and its WebSocket upgrade to the Host; a browser cannot set headers on a WebSocket, so the proxy adds the `Authorization: Device …` header from the app's unary calls to the upgrade) and pair with a link from Settings → Devices. Native behavior is still checked on a development build (below) and reported in the PR's Human QA.

`node scripts/e2e-mobile-pairing-web.mjs` does this end to end against a fresh isolated Host: it pairs by pasting the link, restarts the Host, revokes the phone and checks each screen ([feature map](../../.agents/skills/verify-deepseekbot/features/phone-pairing.md)).

## Run it on a phone

1. **Host.** Start an isolated Host and publish its port on your tailnet with HTTPS:

   ```bash
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080
   tailscale serve --bg 3080                     # https://<machine>.<tailnet>.ts.net → 127.0.0.1:3080
   ```

   The phone talks only to the device gateway, which forwards over loopback, so it needs no `--trusted-host`. Add `--trusted-host <machine>.<tailnet>.ts.net` only if you also open the Web Client through the tailnet name.

2. **Development build.** Once per machine, `npx eas-cli login` and `npx eas-cli init` in `apps/mobile` (writes the EAS project id into `app.json`). Then `pnpm --filter @botharness/mobile eas:dev -- --platform ios` (or `android`) and install the build from the link EAS prints. A local build also works: `pnpm --filter @botharness/mobile ios` / `android` with Xcode or Android Studio. The camera scanner is native code, so a build made before pairing landed must be rebuilt.

3. **Pair.** Start Metro with `pnpm --filter @botharness/mobile start` and open the app. On the computer, open DeepSeekBot settings → Devices → Pair a phone. Scan the QR code with the app (or copy the pairing link and paste it). The settings show a warning with the `tailscale serve` command when the Host has no route a phone can reach.

4. **Check the Roster.** The Roster lists every PersonaBot with its avatar. Send the Bot a DM from the computer: its state turns to Thinking and back on the phone without a refresh. Restart the Host: the app reconnects by itself without pairing again. Settings → Devices lists the phone with its last-seen time; Revoke it and the app shows "Pair again" at once.

5. **Inbox.** Ask the Bot in its DM to run a shell command. The Activity tab shows a badge, and under "Needs my action" each Tool approval and Human question is a post with the Bot, the time and its card. Tap **Allow once** in the post: it leaves the feed and the Bot continues in the DM. Ask it to use `ask_user_question` and answer in the post the same way; several pending questions are checked off one after another. Tap a post's header to open the card in its chat. Decide another one on the computer first: its post leaves the phone's feed without a tap, and a post that loses the race says "Answered on another device" until the next refresh.

6. **Notifications.** Push needs the build's EAS project id (`extra.eas.projectId`, written by `eas-cli init`) and, on Android, FCM credentials uploaded with `npx eas-cli credentials`. `expo-notifications` is native code, so rebuild the development build. After pairing, allow notifications. Open the bell on the Roster, tap **Send a test notification**, and it arrives. Close the app, make the Bot ask for a Tool approval: one notification names the Bot and "needs your approval" with no command; tapping it opens the approval. Approve another one on the computer first: no notification arrives for it and the badge drops. Revoke the phone: nothing more arrives.

7. **Check a DM.** Tap a PersonaBot. Send a uniquely marked message: it shows "Sending…", then "Sent", then settles into the conversation; the reply streams in under "Replying…". Scroll up to page older history. Put the app in the background, send the Bot a message from the computer, return: the message is there once. Turn off Wi-Fi and send: the message shows "Not sent · Tap to retry"; tapping it after reconnecting delivers it once.

The device credential is stored only in the platform's secure storage and never logged; the Host keeps only its hash. "Unpair" forgets it on the phone; revoking it in the Web Client cuts the phone off on the Host.

## Optional statistics

Phone statistics default on for new installs and preserve saved opt-outs, independently of Host telemetry. Settings places the switch last with collapsed details. A one-time informational notice follows the Web client; collection does not wait for dismissal. Public mobile privacy copy and device qualification remain release gates. See [privacy, configuration and device acceptance](../../docs/mobile-statistics.md). Builds send nothing unless explicitly configured for tagged QA or qualified production.
