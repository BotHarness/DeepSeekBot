# Phone pairing and paired devices

## QR images and connection guidance (#2614)

Use the existing pairing → fingerprint comparison → exact-device approval → visible Host content journey. Input method and network route are independent: selecting a QR image must not change the offer's authority or route policy.

1. On the Web Client, open Bot settings → Devices. With only loopback available, **Pair a phone** is disabled. **Same local network** offers explicit **Enable local access**; **Through Tailscale** offers **Show connection steps**. Opening this page or the Tailscale disclosure must not publish a route. LAN readiness must not complete the Tailscale steps.
2. Enable local access visibly. Confirm the listener through `device-lan status`, then open **Pair a phone**. Check the dialog names the actual offered connection types, has **Copy pairing link**, and explains image input. Repeat with Tailscale only and both routes. A published address is preparation, not phone reachability evidence. Capture matched base/candidate light/dark screenshots with all QR payloads, fingerprints identifying personal devices and private addresses excluded from public evidence.
3. In the assigned native device window, save a fresh task-owned QR image locally, open either mobile connection entry and tap **Choose QR image**. Use the system picker. Recognition must automatically reach the existing fingerprint/approval flow; approve only the verified task-owned key and require visible Host content plus canonical paired-device evidence. Repeat with camera permission denied, without granting it. The image stays local.
4. Cancel the picker; select an image without a QR code; select an image containing multiple distinct codes; select an unsupported QR and an expired pairing QR. Require appropriate refusal/recovery, no unexpected paired device and a successful fresh-image retry. Tap the image action twice and navigate back during picking/decoding: no second picker or late pairing may start. Retest camera, paste and direct links separately.
5. On native Android and iOS, exercise light/dark and default/intermediate/maximum system text, visible image action and errors, and keyboard-open paste submission. Native picker/decoder evidence cannot be replaced by a Web export or mocked decoder. Keep unavailable platforms explicitly untested.
6. Qualify actual LAN and actual Tailscale separately through the same approval/content flow. Preserve existing service mappings, pairings and phone data. Revoke only task-owned test devices and restore task-owned network changes. An expired code shows **New code**; a failed LAN enable remains retryable, and a listener without a local address explains how to recover.

## Encrypted LAN (#2599)

Reserve the native QA lane before starting a Host, build or device. New native builds are required for `LanChannel`; record iOS and Android separately.

1. Devices starts with local access off. `device-lan enable` without `--confirm` refuses. Capture the matched base/candidate Devices states.
2. Enable local access visibly. Choose **Use the same Wi-Fi** in the installed app, scan the computer QR and approve the exact phone key on the computer. Capture both themes and default/intermediate/maximum text. Exclude QR payloads and private addresses from public evidence.
3. Without WAN, read the real Host Feed over LAN. Separately, with a reachable model, send a marked DM and verify the visible reply and canonical timeline. A model failure is not a LAN failure.
4. Restart both peers; trust and the logical Host remain. Revoke the phone; streams close and reconnect refuses. Disable LAN and verify port release while independent remote access remains.
5. Wrong Host pins, legacy pairings without keys, reused and expired offers refuse. Denied local-network permission shows recovery guidance. This slice does not add mutation replay or proactive handover.

A Human pairs the phone app with their Host by a one-time QR code, and the phone keeps working across Host restarts until the Human revokes it. The phone holds a per-device credential and talks only to the device gateway (`/botharness-device/*`, [ADR-0199](../../../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)).

## Sub-features

- `full-client-removed`: no settings/chat/Inbox/routine/create action opens the full Host WebView; old `/full-client` deep links cannot load it. Private input directs the Human to the Host or Tailscale browser.

- `offer` creates a one-time pairing offer (5 minutes) with a QR code and a `deepseekbot://pair?p=…` link.
- `pair` redeems the offer once; a second redeem answers `401 offer-invalid`.
- `link-errors` words a refusal by how the phone got the offer: a pasted or opened link that is broken, expired or already used says the link is wrong, and a pasted one empties the field; a scan keeps the code wording.
- `manual-input` keeps the empty link field and Pair button above the Android keyboard. A manually scanned or pasted offer registers the phone, loads the Host roster and survives app process restart.
- `cloud-exit` leaves the native pairing modal before opening Cloud services, so Workspaces exposes a visible, operable drawer.
- `fingerprint-steps` opens a fresh encrypted invitation. For pasted and opened links, the link form is replaced by a focused computer verification page with all 64 fingerprint digits, selectable grouped text and native actions. Expand/collapse the explanation without granting trust. A mismatch or Back must cancel without opening a channel; a fresh invitation still works. Explicitly compare with the trusted Host, tap Fingerprints match, then compare the full phone fingerprint with Host Devices and approve only that key. The phone waits without a second trust action and remains cancellable. Check light/dark and default/intermediate/maximum text; compare full fingerprints before scrolling to reachable actions. Both account and direct-link routes use the same verification view.
- `pair-return` uses the existing assigned iOS Simulator: compare the real Connect Host fingerprint, approve the exact displayed device key, then immediately open Chats, Settings (close and reopen) and Activity without restarting/reloading the app. Require no `sheetPresentationController` error or blocked taps. Repeat with the first-use notice unread/read, light/dark and default/intermediate/maximum system text. `apps/mobile/.maestro/sim/pairing-return.yaml` runs the post-approval interaction check without launching or clearing the app; keep native approval and capture evidence alongside it.
- `roster` shows the Host's PersonaBots in the app through the gateway, with the live stream.
- `restart` keeps the phone connected after a Host restart without pairing again.
- `devices` lists each phone with its pairing and last-seen time.
- `revoke` refuses the phone's next call and closes its open stream; the app shows "Pair again".

## How to get to it (user POV)

- Computer: Bot mode → settings → Devices → enable local access or show the Tailscale connection steps → Pair a phone. The dialog shows the QR code, available connection types and a copy link; the Devices list has Revoke.
- Phone: first use opens "Pair with your computer". From an existing session: Workspaces → Computers → Pair a new computer. Scan the code or paste the link, then tap Pair. Cloud → Join by link or QR is the separate cloud invitation path; its preview identifies organization membership versus one-channel guest access. The category tabs are the first drawer row; swipe, backdrop, Android Back and accessibility escape dismiss it.

## Driving it with verify-app

Native steps belong to the designated [shared device QA runner](../../../../docs/agents/device-qa.md). Submit them to the queue before starting a Simulator, Metro, native build or Host. The commands below describe the runner’s tools.

Both journeys own their Host: they launch a fresh instance on a free port, restart it and stop it.

- **Phone UI.** `pnpm build`, then `node scripts/e2e-mobile-pairing-web.mjs`. It exports the app for web, serves it from a phone origin at a 390 × 844 viewport, pastes the pairing link, taps Pair, restarts the Host, revokes the phone and checks every step on screen. It first pastes a broken link and checks the link wording and the emptied field (`badLinkNamesTheLink`, `badLinkClearsField`, light and dark screenshots). It prints JSON with `"result":"pass"` and `offerSingleUse`, `reconnectedWithoutPairing`, `listedWithLastSeen`, `revokeClosedStream`, `credentialNotInConsole`, `noPageErrors` and `credentialNotInHostLog` all `true`. Screenshots, ARIA trees and the console go to `.humanlayer/verify/mobile-pairing-web/evidence/`. `--skip-export` reuses an existing `apps/mobile/dist-web`; `--keep` leaves the Host running.
- **Native app (Mac).** With a development build on the iOS Simulator and Metro running, `pnpm --filter @botharness/mobile e2e:ios` checks the unpaired pair screen and the refusal of a bad pasted link; `npx agent-device` drives it by accessibility ref. Commands are in `apps/mobile/README.md` ("Drive it on the iOS Simulator"). `node scripts/e2e-mobile-sim.mjs` pairs a fresh Simulator with two live Hosts by deep link; see [phone-notifications.md](phone-notifications.md).
- **Android (queued Windows runner).** Claim the matching shared lease and open the unpaired development app with Metro running. Run `node scripts/e2e-mobile-pair-android.mjs --serial <serial> --owner <task> --batch <batch> --label keyboard` with an empty field: it focuses the input, asserts that the input and Pair button are above the real IME, and keeps PNG/XML plus JSON proof. Then start an isolated Host, seed a QA Bot and let the Human scan a fresh offer or paste its link. For USB transport, add an explicit ADB reverse mapping and use its phone-side loopback origin in the offer routes; do not expose the operator token. Once paired, run the same journey with `--paired --instance .humanlayer/verify/<name>/instance.json --expect-bot <qa-bot-name> --label paired`. It requires one live device on the isolated Host, checks the visible Host and Bot, restarts the app, and checks both again. No screenshot is taken while a credential field is present. It verifies app restart, not Host restart or revoke. Chinese IMEs may compose injected hardware keys, so the runner does not automate link typing. Never erase a Human's saved pairings to prepare the unpaired check.
- **Protocol.** `node scripts/e2e-device-pairing.mjs --home <dir> --port <n>` drives the same flow over HTTP and the WebSocket, including a device call under a tailnet Host name and a refused upgrade after revoke.
- **Web Client.** `node scripts/verify-app.mjs shot devices --name <n> --bot-mode --locale en --click "Bot settings" --click Devices --click-text "Enable local access" --click-text "Pair a phone" --wait "Pairing QR code"` opens the QR dialog on a Host with a usable LAN address. When only loopback is available, Pair a phone stays disabled and the connection entries explain preparation. Open Show connection steps to verify the independent Tailscale flow. Record real phone reachability separately from Host route preparation.
- **Hosted Connect section (#2387).** The same Devices page has "Connect without Tailscale". Without a deployed relay, launch with local stand-ins: `DEEPSEEKBOT_CONNECT_RELAY` pointing at a fake relay, a `NODE_OPTIONS=--import` preload answering `api.workos.com`, and `DEEPSEEKBOT_CLOUDFLARED` pointing at a script that prints `Registered tunnel connection` to stderr. Then `--click-text "Sign in" --wait-text "<user code>"`, approve in the stand-in, and `--wait-text Connected`; the Tailscale warning disappears and a new offer carries the Connect route. Against the real relay, `deepseekbot connect-sign-in --wait` does the same from the CLI.

## Pair modal to Cloud services regression

In the assigned native QA window, use the signed-out app without redeeming a pairing:

1. Cold launch → Join with invitation → Connect a cloud service → Workspaces. Confirm both drawer tabs and a reachable action.
2. Computers → Pair a new computer → Cloud services → Workspaces. Confirm the drawer is visible above the page; tap Manage cloud services and check it closes the drawer.
3. Return to Join with invitation, then Connect a computer → Cloud services → Workspaces. This covers the target not already in the stack. Close with a left swipe, then Back must return to Join with invitation without a residual Pair modal.
4. Capture matched light/dark before/after screenshots. A drawer store reporting `open: true` is insufficient: the native modal can cover the root overlay.

Cloud services exits the pairing form; its unfinished local inputs are not saved. These empty-form navigation checks do not prove in-flight pairing cancellation or return to an already paired Computer. Keep those, Android and physical-device checks separate.

## Optional phone statistics

Settings shows a default-on switch at the bottom with collapsed details; pairing has no statistics control. Saved opt-outs remain off. In the shared-device QA lane, follow [the mobile statistics acceptance path](../../../../docs/mobile-statistics.md#runnable-device-acceptance): verify the one-time Web-aligned notice, privacy/source links, Settings navigation and persistent dismissal (not a collection gate), prove zero vendor requests after opt-out, then enable tagged QA and correlate pairing, live Roster and first-chat events with PostHog. Repeat on physical iOS and Android. Capture both supported languages and opt-out while offline. Web exports and injected-sender tests do not qualify device delivery.

## Contextual creation (#2195)

In the assigned UAT device window, preserve original accounts, pairings and files first. Capture baseline and candidate on the same installed native build. From Chats select Computer, All and an owner Organization, then open the separate bottom **+**. Check scoped actions; All must ask for a target even when only one is eligible. Dismiss via close/back/backdrop without changing tab or writing. Repeat on Activity and confirm inherited source and pending badge remain unchanged.

Use only designated empty test fixtures. Through the visible Computer creation flow create a message-free Channel and open the result; independently read its ID/name/membership from the Host API/CLI. Through the Cloud form create one uniquely named UAT Channel and verify its Organization/account and returned ID through the public API. Retry a pending request explicitly without duplicates. Member and channel guest controls must not expose owner actions, and direct public writes must be denied. Test source/account replacement during preflight and form entry as refusal, never fallback. Do not send messages or invoke models for these cases.

Record default/intermediate/maximum text in both themes, reachable labels, keyboard-open submit and final-row safe area. Inspect screenshots, save menu interaction video, and separately disclose Android/phone/screen-reader/Human gaps. Delete only disposable Host resources through their owner API; if the Cloud service has no deletion contract, record the bounded retained test Channel rather than editing storage. Revoke only task sessions/grants and restore original app state, preferences, QA branch and lane.

## Gotchas

- Neither journey needs a model credential.
- The Devices row title and its button are both "Pair a phone", so `--click "Pair a phone"` lands on the title text; `--click-text` only matches buttons.
- A browser cannot set headers on a WebSocket, and the web export runs the native carrier unchanged (`apps/mobile/AGENTS.md` keeps web-only code paths out of the app). The journey's phone origin therefore adds the `Authorization: Device …` header it last saw on the app's own unary calls to the stream upgrade, standing in for the native WebSocket header. After a revoke it forwards the same revoked header, so the refusal is real.
- The journey rewrites the pairing link's routes to its phone origin, so it does not prove route choice; `apps/mobile/test/host-client.test.ts` covers that.
- The camera scanner, Keychain/Keystore storage and the native WebSocket only run in a development build on a phone; see `apps/mobile/README.md`.
