# Bot Browser on the phone

A paired phone watches a PersonaBot's local Browser on a native screen, pauses the Bot, drives the page with touch and the keyboard, and hands it back. Every request goes through the device gateway, and revoking the phone stops the screen.

## Sub-features

- `live` long-polls `/api/browser/frame` through `/botharness-device/api/…` and shows the newest frame, fitted to the screen and zoomable with pinch.
- `takeover` flips `/api/browser/takeover`; while the Human has the Browser, **Tap** clicks where the finger lands, **Trackpad** moves a cursor and taps at it, a vertical drag scrolls, a long press right-clicks and the keyboard button types.
- `cli` sends the same input with `deepseekbot browser-input <id> --args-stdin` and saves a frame with `deepseekbot browser-frame <id> --out <file>`.
- `revoked` shows "Your computer revoked this phone's access." once the device is revoked.

## How to get to it (user POV)

- In the app, open a Bot whose Browser Access is on, tap its name to open the profile, then tap **Browser**.

## Driving it with verify-app

Preconditions: no model credential is needed. Run as a regular user, because the Bot Browser's Chrome refuses root.

- **Scripted journey.** `node scripts/e2e-mobile-browser-web.mjs [--skip-export]` exports the app for web, pairs it through a phone-origin proxy, opens a fixture page in the Bot Browser with `browser_open`, then checks the live frame, Pause Bot, a tap reaching the page, Trackpad, Resume, that no request leaves the gateway, and the revoked state, in light and dark. Set `PUPPETEER_EXECUTABLE_PATH` when Puppeteer's own Chrome is not installed for that user. Evidence lands in `.humanlayer/verify/mobile-browser-web/evidence/`.
- **Live test.** `MOBILE_LIVE_HOST_URL=<instance url> pnpm vitest run apps/mobile/test/browser-viewer.live.test.ts` drives the same flow through the app's Host client.

## Gotchas

- The web export is layout evidence. Gesture feel, the native keyboard and safe areas need a development build on a phone.
