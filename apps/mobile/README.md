# DeepSeekBot mobile app

Native Expo client for the Human's own Host (hub [#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), spec [#1645](https://github.com/BotHarness/DeepSeekBot/issues/1645)). This first tracer ([#1650](https://github.com/BotHarness/DeepSeekBot/issues/1650)) logs in to an isolated Host over Tailscale HTTPS with the Host's launch token and shows the Roster of PersonaBots and group Channels with live state.

The launch-token login is **development-only**. It is replaced by the paired-device credential of ADR-0199 (#1649): the carrier sends `Authorization: Device …` to the BotHarness device gateway, with the same unary envelope and mux frames, so only `src/host/native-carrier.ts` and the login step change.

## Layout

- `src/host/` — the Host client module. One deep module owns the route, the login, unary calls, the Remote stream socket, reconnection and connection state. Screens read it through `useHostSnapshot()` and never talk HTTP. It is plain TypeScript with an injected carrier (`carrier.ts`), so it is tested in Node.
- `src/host/wire.ts` — the slice of the Host's wire shapes the app reads; `test/wire-contract.ts` checks the Host's own types against it in the root typecheck.
- `app/` — Expo Router screens: two tabs, the Roster (`(tabs)/index.tsx`) and the Human Inbox (`(tabs)/inbox.tsx`); a Bot DM (`dm/[slug].tsx`); an Inbox item (`inbox/[id].tsx`); and the development login (`connect.tsx`).
- `src/host/inbox.ts`, `src/host/requests.ts` — the Human Inbox ([#1653](https://github.com/BotHarness/DeepSeekBot/issues/1653)). The list is the Host's `humanAttention` (actions, then mentions and replies, then handled), re-read whenever the live Roster or Activity stream changes; the app keeps no Inbox store. Tool approvals and Human questions are read with `channelTimeline` plus `toolApprovalStatus` / `userQuestionStatus` and decided with `toolApprovalDecide` / `userQuestionAnswer`, the methods the Web Client and the live CLI verbs call. The first accepted decision wins; a late one comes back as "already decided" or "expired". Private input opens in the full client.
- `src/host/conversation.ts` — one Human–PersonaBot DM ([#1651](https://github.com/BotHarness/DeepSeekBot/issues/1651)): it follows `botharness/followChannel` on the shared socket, keeps one contiguous window of Channel revisions, repairs a gap and pages older history with `channelJournalPage` (ADR-0179), and sends with `channelSend` and a `human-<uuid>` id made on the phone, so a retry is idempotent (ADR-0159). Bot drafts arrive as notifications and are replaced by the committed reply. `native-cache.ts` keeps the last page per Bot for the first paint; unpairing deletes it.
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
                                                # also drives a live isolated Host: a real PersonaBot asks for a Tool
                                                # approval and a Human question, and the app's modules decide them;
                                                # a real DM reply plus resume (creates a PersonaBot if none)
pnpm --filter @botharness/mobile export          # Metro bundles for iOS and Android
```

## Screenshots without a phone

Cloud sessions have no simulator: the container has no KVM for the Android emulator, no macOS for the iOS simulator, and the egress policy blocks `expo.dev`, so EAS cannot be driven from there. For PR evidence they render the same screens through React Native Web and screenshot them at a 390 × 844 phone viewport:

```bash
EXPO_OFFLINE=1 pnpm --filter @botharness/mobile export:web
python3 -m http.server 8099 --directory apps/mobile/dist-web &
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-light.png light
node apps/mobile/scripts/web-screenshot.mjs http://127.0.0.1:8099/ connect-dark.png dark
```

The web render is layout evidence, not native evidence: it shows the app's own views, copy, spacing and theme, but not native headers, large titles, keyboard behavior or fonts. `expo-secure-store` has no web backend, so the web build keeps the paired Host in the tab's `sessionStorage` instead (`src/host/saved-host.web.ts`). To render screens with live data, serve `dist-web` and the Host's `/api` from one origin (a small reverse proxy that forwards `/api/*`, its WebSocket upgrade and `/?token=` to the Host), then seed `sessionStorage['deepseekbot.host.v1']` with `{ route, token }` before the page loads. Native behavior is still checked on a development build (below) and reported in the PR's Human QA.

## Run the tracer on a phone

1. **Host.** Start an isolated Host and note its token URL. Put it on the tailnet with HTTPS and trust that name:

   ```bash
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080
   tailscale serve --bg 3080                     # https://<machine>.<tailnet>.ts.net → 127.0.0.1:3080
   # restart the same Host with the tailnet name trusted (stop its exact PID first):
   node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port 3080 --trusted-host <machine>.<tailnet>.ts.net
   ```

   Without `--trusted-host` the Host answers `403` to every `/api` call from the tailnet name.

2. **Development build.** Once per machine, `npx eas-cli login` and `npx eas-cli init` in `apps/mobile` (writes the EAS project id into `app.json`). Then `pnpm --filter @botharness/mobile eas:dev -- --platform ios` (or `android`) and install the build from the link EAS prints. A local build also works: `pnpm --filter @botharness/mobile ios` / `android` with Xcode or Android Studio.

3. **Connect.** Start Metro with `pnpm --filter @botharness/mobile start`, open the development build, enter `https://<machine>.<tailnet>.ts.net` and the token from the token URL. The phone must be on the same tailnet.

4. **Check the Roster.** The Roster lists every PersonaBot with its avatar. Send the Bot a DM from the computer: its state turns to Thinking and back on the phone without a refresh. Stop the Host: the banner shows "Cannot reach your computer" with the route; start it again on the same home and the app reconnects by itself. Starting a fresh home (a new signing secret) with the old token shows "Pair again".

5. **Inbox.** Ask the Bot in its DM to run a shell command. The Inbox tab shows a badge and the Tool approval under "Needs my action"; open it, check the tool and arguments, tap **Allow once**, and the Bot continues in the DM. Ask it to use `ask_user_question` and answer on the phone the same way. Decide another approval on the computer first: it leaves the phone's list, and opening it shows "Already decided on another device".

6. **Check a DM.** Tap a PersonaBot. Send a uniquely marked message: it shows "Sending…", then "Sent", then settles into the conversation; the reply streams in under "Replying…". Scroll up to page older history. Put the app in the background, send the Bot a message from the computer, return: the message is there once. Turn off Wi-Fi and send: the message shows "Not sent · Tap to retry"; tapping it after reconnecting delivers it once.

The token is stored only in the platform's secure storage and is never logged. The Host's session cookie lives in the app's own cookie store; unpairing forgets the token.
