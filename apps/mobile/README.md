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

## Android Local Computer video controls

The native Windows → Android video viewer opens as an observer, with no mouse or click buttons.
After **Take control**, swipe one finger to move the large local arrow, then tap to left-click
at that arrow. The icon + **Left** / **Right** buttons and a long press act at the same cursor.
Remote clicks require **Take control**, a current grant
and live video; observing and moving the local arrow do not pause Bots.

Use two fingers to pinch and pan the phone preview, while watching or controlling. This does
not scroll or drag the remote desktop. The canvas starts at the top and keeps its zoom and
position when fingers lift, including below fit size. **Reset view** restores its default fit
and top position without remote input. Showing/hiding control buttons preserves the preview;
width/display changes and reconnect reset the preview and cursor.

Computer supports Android landscape; other screens remain portrait. The compact toolbar keeps
**Left** at its left edge and **Right** at its right edge. Tap either button to click; drag it
horizontally or vertically to scroll the remote desktop at the cursor. The slider follows the
chosen drag axis (Left starts horizontal, Right vertical); dragging never also clicks.
The single **Take control** / **Hand back** button explicitly pauses or resumes Bots.
Hand back releases control and resumes Bots together, retaining observation. Exit is in the
top-right header; exit, backgrounding and connection loss preserve a paused Bot state.
There is no visible instruction caption. Keyboard/IME and direct-touch parity remain
tracked in [#2559](https://github.com/BotHarness/DeepSeekBot/issues/2559).

Errors offer concrete recovery steps: LAN pairing/connection failures ask you to connect the
phone to the computer's Wi-Fi, allow local-network access and enable local access in the
computer's Settings → Devices. Remote connection failures ask you to check the phone network
and keep the computer awake with DeepSeekBot running. Computer offers **Retry** for a lost
Host connection, **Reconnect video** for video failures, and **Pair again** after device
refusal. Retrying never takes control or resumes Bots. Normal viewing has no instruction
caption; long error guidance scrolls separately from the mouse controls.

## Toolchain

Expo SDK 58 (React Native 0.88, React 19.3) inside the pnpm workspace with pnpm's default isolated linker: no `node-linker=hoisted`, no `.npmrc` change. `metro.config.js` adds one resolver rule so Metro can follow the Host sources' `.js`-suffixed TypeScript imports. Having React Native in the workspace makes pnpm link it as an optional peer of a few web packages (`morphicons`, `@tanstack/charts`); those packages only load it from their explicit React Native entry points.

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

For first-DM visibility, working-indicator ordering and reply scrolling, use the [first-reply regression checks](../../docs/agents/mobile-first-reply.md) ([中文](../../docs/agents/mobile-first-reply.zh.md)). The guide separates source coverage from queued iOS/Android acceptance.

## Full client in the app

The full Host WebView and all in-app entry points are removed (#2541). Use native screens; operations they do not support require the Host client or a separately opened browser over Tailscale. The old `/botharness-device/web/` HTTP, cookie and socket proxy is unavailable. Native Browser/Computer viewers are separate features.

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
BOTHARNESS_MOBILE_WEB_PREVIEW=1 EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export:web
python3 -m http.server 8099 --directory apps/mobile/dist-web &
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-light.png light
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-dark.png dark
```

`BOTHARNESS_MOBILE_WEB_PREVIEW=1` opts into screenshot-only Metro overrides under `scripts/web-preview/`: browser-local language/appearance preferences and Material-symbol rendering. Normal app builds keep their native adapters. Use the same overrides for both base and PR exports, label the images **Expo Web layout preview**, and follow the [PR evidence workflow](../../docs/agents/pr-ui-visual-evidence.md#mobile-web-preview-first-native-evidence-follows) to supplement them with native device screenshots. Other unsupported Web paths remain unsupported.

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

## TestFlight and Google Play test builds

The `store-test` EAS profile builds the formal app: **DeepSeekBot** / `app.deepseekbot.mobile`, scheme `deepseekbot`, owner `deepseekbots-team` and the linked EAS project (`app.config.js` reads `DEEPSEEKBOT_APP_VARIANT=store`). Development builds keep `DeepSeekBot Dev` / `ai.botharness.deepseekbot.dev`. Cloud Channels are behind a feature flag: every build hides them unless `EXPO_PUBLIC_DEEPSEEKBOT_CLOUD=on` (the store build sets `off`). With the flag off, the app only pairs with the Human's own Computers, through a DeepSeekBot account or over Tailscale: a fresh install opens the pairing sheet, and cloud Channels, workspace tabs and cloud links are hidden. Build numbers are remote and auto-increment; OTA updates stay off. Testers set up Tailscale and pair with [Pair your phone](../../docs/mobile-pairing.md) ([中文](../../docs/mobile-pairing.zh.md)).

**Links when both apps are installed.** Public `deepseekbot://pair?p=…` links open the store app. Dev registers only `deepseekbot-dev` and `ai.botharness.deepseekbot.dev`, plus the Expo launcher scheme `exp+deepseekbot`; store builds do not register the Expo launcher scheme. Rebuild and update both installed variants in place to remove their old conflicting registrations (Metro alone cannot change it). Do not uninstall or reset either app. Bundle IDs, Keychain keys and App Groups stay unchanged.

The Host continues generating public pairing links. Inside either app, the pairing camera and paste field accept both public and Dev links with the same payload validation. For an external Dev launch, change only the `deepseekbot:` prefix of a fresh pairing link to `deepseekbot-dev:`; keep the encoded payload intact and private. `scripts/e2e-mobile-sim.mjs` does this for its Dev-only journey while renaming its test Host. Android's paste-based helper needs no rewrite. No new Host link variant or API is needed.

Connect authorization still returns to the initiating app's bundle-ID scheme (`ai.botharness.deepseekbot.dev:/oauth2redirect` or `app.deepseekbot.mobile:/oauth2redirect`). Cloud UAT keeps its existing Dev callback. This does not change provider callback allowlists. Share extensions use the first scheme of their own variant; notification extensions retain the corresponding App Group. Verify both apps installed, external links, in-app QR/paste, share return, Expo launch, existing pairing/login retention and authorization return in the next owner-assigned native batch; configuration tests do not prove OS app selection.

```bash
cd apps/mobile
npx eas-cli build:version:get -p all -e store-test   # once: compare with App Store Connect and Play Console
npx eas-cli build --profile store-test --platform all --auto-submit
```

`--auto-submit` uploads iOS to TestFlight (`ascAppId` in `eas.json`) and Android to the Play internal track as a draft, which is rolled out in Play Console. Google Play needs one manual AAB upload before the API (and so `eas submit`) can upload, plus a Google service account key in EAS credentials. Android push needs two things from the Firebase project, which registers both `app.deepseekbot.mobile` and the development package `ai.botharness.deepseekbot.dev`: its `google-services.json`, stored as the EAS file environment variable `GOOGLE_SERVICES_JSON` in the production, preview and development environments (`npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment production --environment preview --environment development`), which `app.config.js` passes to `android.googleServicesFile` for either variant; and the FCM V1 service account key, uploaded with `npx eas-cli credentials` for each package. A local `expo run:android` gets push from `.secrets/google-services.json` in the main checkout (see [machine-local secrets](../../docs/agents/device-secrets.md)). Without them the app works but cannot register for notifications.

`store-test-apk` builds the same store app as an installable APK for sideloading (`npx eas-cli build --profile store-test-apk --platform android`). It is signed with the upload key, while Play re-signs its copy, so a phone must uninstall one before installing the other. Run EAS builds with `EAS_NO_VCS=1 EAS_PROJECT_ROOT=../..` from `apps/mobile`: otherwise EAS also uploads the repository's `.git` history, which is over 1 GB.

### Store privacy answers

Both stores refuse an external TestFlight review or a Play rollout until the app's privacy answers and policy are in place. The answers live in [`store/privacy/`](store/privacy/README.md); the public policy is the "Mobile app" section of <https://deepseekbot.app/en/privacy/#mobile-app>.

1. **Re-check before each store build** whether anything the app sends changed: cloud on, statistics on, a new permission, SDK or data flow. If it did, update `store/privacy/` and the site's `content/privacy/{en,zh}.md` in the same change.
2. **Publish the policy.** The site does not deploy on merge: after the site PR merges, run `pnpm deploy` in `deepseekbot-site` (after `npx wrangler login`) and check the live page.
3. **App Store:** upload `app-store-privacy.json` with fastlane ([command](store/privacy/README.md#apply)). It replaces and publishes the answers.
4. **Google Play:** the first time, fill App content → Data safety in Play Console from the table in `store/privacy/README.md`, export it and commit `play-data-safety.csv`. After that, edit the CSV and upload it through the Play Developer API ([command](store/privacy/README.md#apply)).
5. Put the policy URL in both store listings, then submit the build for review.

## Optional statistics

Phone statistics default on for new installs and preserve saved opt-outs, independently of Host telemetry. Settings places the switch last with collapsed details. A one-time informational notice follows the Web client; collection does not wait for dismissal. Public mobile privacy copy and device qualification remain release gates. See [privacy, configuration and device acceptance](../../docs/mobile-statistics.md). Builds send nothing unless explicitly configured for tagged QA or qualified production.

## SDK 58 upgrade checks

Use the repository's pinned Node and pnpm versions. SDK 58 targets React Native 0.88 and React 19.3; install native dependencies with Expo's SDK-aware installer. Existing SDK 57 development clients must be rebuilt through the shared device QA queue. Native projects remain generated.

CI checks Expo Doctor, types and tests, and exports both iOS and Android bundles in a required `mobile-export` job. Exporting bundles does not compile native code: separately verify a fresh iOS build and Android Release build (including R8), then the native user journeys. Android compilation requires compile SDK 37. The web preview explicitly retains single-page output. The simulator cache uses the strict fingerprint preset so app-version changes invalidate a cached native binary; SDK 58's balanced default ignores those version fields.

For retained-data acceptance, install over an existing build with the same app identity and verify paired Hosts, local appearance, collapsed sections, DM activity preferences and statistics settings after restart. The fresh-install simulator journey alone does not prove upgrade preservation. Record simulator, real-device and Human QA results separately; follow [shared device QA](../../docs/agents/device-qa.md) for scheduling and resource limits.

### Channel Agents (UAT candidate)

Open Cloud channels → choose an owned channel → Channel agents. Create a named Agent, then explicitly Copy credential into its private configuration file. Only message read/send is granted in this channel; no organization membership or computer execution permission. One saved handoff can be retried after restart. Remove saved credential does not revoke the Agent; Revoke agent does. Secrets are omitted from normal snapshots/logs, and sign-out removes the saved handoff. Real UAT/native evidence is still pending for this increment.

### Memory file previews

Open a Bot profile, expand Memory and choose a file. PNG/JPEG/GIF/WebP and safe static SVG open in the reader and tap to enlarge; Share uses the displayed temporary bytes. Markdown opens as a readable GFM document with Preview/Source controls. Local image references follow the observed document version and the same repository-relative rules as Web; pull to refresh when a document changes. External HTTPS images require an explicit tap and only load when visible. Static SVG shares the Host XML/CSS, size and expansion checks before native decoding. Native Git diff navigation, editor and attachment previews remain future #2214 slices. Native acceptance is scheduled through the shared device QA queue; component shims and bundle exports are separate checks.

## Profiling production JavaScript

Use the assigned native QA window and its existing Metro inspector. The default
`apps/mobile/scripts/rn-profile.mjs` mode requires a React DevTools hook and fails
if it is missing. For production JavaScript on a Debug native binary, explicitly
select CPU and JS-frame sampling without React:

```sh
node /path/to/tool-checkout/apps/mobile/scripts/rn-profile.mjs \
  --no-react --metro "$QA_METRO_PORT" --out "$QA_RUN_DIR/profile" \
  --max 20 --quiet 3 --run 'sh "$QA_ACTION_DRIVER"'
```

The tool can run from a separate checkout with its existing dependencies; it does
not modify the app checkout. Verify the intended inspector target first: it picks
the first eligible target. Without `--run`, JS-only mode records until `--max`;
with a driver, it stops after the driver exits and the quiet tail, or at the cap.
Check driver exit, completed actions and owned child cleanup separately: profiler
success alone does not prove the scenario succeeded.
JS-only captures stop their frame collector on normal completion, errors and
SIGINT/SIGTERM, with at most one second for best-effort inspector cleanup. An
unreachable inspector is reported as cleanup unconfirmed. SIGKILL cannot run
cleanup; the next JS-only installation disables the previous collector before
starting another. CPU cleanup sends stop only after its own start was acknowledged. A rejected or
unacknowledged start does not establish ownership; an unknown outcome is reported
as unconfirmed. Check the inspector before retrying an interrupted CPU capture.

In this mode, `summary.json` reports `mode: "js-only"`, `react: null` and the reason;
`js-frames.json` contains the actual JS capture boundaries and rAF samples, while
`profile.cpuprofile` retains the Hermes samples. Use a fresh output directory per
capture. Default React mode still writes `react.json` and uses the first-to-last
commit window for its frame metrics. The `capture` fields label JS monotonic and
CPU-profile time spans separately; legacy `recordedSeconds` also includes result
processing and must not be used as an exact capture denominator.

JS-only frame metrics use the full JS capture window, including idle time. They
measure JavaScript scheduling, assume a 60 Hz frame budget, and do not measure
native presentation, physical touch latency or 120 FPS. Hermes attribution is
sampled; it does not count or time individual draft writes. Keep tool version,
mode, binary, workload and duration fixed across comparisons. Missing React data
requires a separate development-JS React profile; do not report it as zero work.
