# Phone pairing and paired devices

A Human pairs the phone app with their Host by a one-time QR code, and the phone keeps working across Host restarts until the Human revokes it. The phone holds a per-device credential and talks only to the device gateway (`/botharness-device/*`, [ADR-0199](../../../../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)).

## Sub-features

- `offer` creates a one-time pairing offer (5 minutes) with a QR code and a `deepseekbot://pair?p=…` link.
- `pair` redeems the offer once; a second redeem answers `401 offer-invalid`.
- `roster` shows the Host's PersonaBots in the app through the gateway, with the live stream.
- `restart` keeps the phone connected after a Host restart without pairing again.
- `devices` lists each phone with its pairing and last-seen time.
- `revoke` refuses the phone's next call and closes its open stream; the app shows "Pair again".

## How to get to it (user POV)

- Computer: Bot mode → settings → Devices → Pair a phone. The dialog shows the QR code and a copy link; the Devices list has Revoke.
- Phone: the app opens on "Pair with your computer"; scan the code or paste the link, then tap Pair.

## Driving it with verify-app

Both journeys own their Host: they launch a fresh instance on a free port, restart it and stop it.

- **Phone UI.** `pnpm build`, then `node scripts/e2e-mobile-pairing-web.mjs`. It exports the app for web, serves it from a phone origin at a 390 × 844 viewport, pastes the pairing link, taps Pair, restarts the Host, revokes the phone and checks every step on screen. It prints JSON with `"result":"pass"` and `offerSingleUse`, `reconnectedWithoutPairing`, `listedWithLastSeen`, `revokeClosedStream`, `credentialNotInConsole`, `noPageErrors` and `credentialNotInHostLog` all `true`. Screenshots, ARIA trees and the console go to `.humanlayer/verify/mobile-pairing-web/evidence/`. `--skip-export` reuses an existing `apps/mobile/dist-web`; `--keep` leaves the Host running.
- **Native app (Mac).** With a development build on the iOS Simulator and Metro running, `pnpm --filter @botharness/mobile e2e:ios` checks the unpaired pair screen and the refusal of a bad pasted link; `npx agent-device` drives it by accessibility ref. Commands are in `apps/mobile/README.md` ("Drive it on the iOS Simulator"). `node scripts/e2e-mobile-sim.mjs` pairs a fresh Simulator with two live Hosts by deep link; see [phone-notifications.md](phone-notifications.md).
- **Protocol.** `node scripts/e2e-device-pairing.mjs --home <dir> --port <n>` drives the same flow over HTTP and the WebSocket, including a device call under a tailnet Host name and a refused upgrade after revoke.
- **Web Client.** `node scripts/verify-app.mjs shot devices --name <n> --bot-mode --locale en --click "Bot settings" --click Devices --click-text "Pair a phone" --wait "Pairing QR code"` opens the QR dialog. Without Tailscale both the section and the dialog warn that a physical phone cannot reach the Host.

## Gotchas

- Neither journey needs a model credential.
- The Devices row title and its button are both "Pair a phone", so `--click "Pair a phone"` lands on the title text; `--click-text` only matches buttons.
- A browser cannot set headers on a WebSocket, and the web export runs the native carrier unchanged (`apps/mobile/AGENTS.md` keeps web-only code paths out of the app). The journey's phone origin therefore adds the `Authorization: Device …` header it last saw on the app's own unary calls to the stream upgrade, standing in for the native WebSocket header. After a revoke it forwards the same revoked header, so the refusal is real.
- The journey rewrites the pairing link's routes to its phone origin, so it does not prove route choice; `apps/mobile/test/host-client.test.ts` covers that.
- The camera scanner, Keychain/Keystore storage and the native WebSocket only run in a development build on a phone; see `apps/mobile/README.md`.
