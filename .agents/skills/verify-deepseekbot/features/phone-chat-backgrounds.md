# Native mobile chat backgrounds

## Sub-features

Device defaults, DM/Group overrides, transactional preview, still-image ownership and restart persistence, Fill/Fit and crop position, theme fade, large text and keyboard stability.

## How to get to it (user POV)

- Settings → Interface → Default chat background.
- Open a Human/Bot DM → Bot profile → Chat background.
- Open a group → Group details → Chat background.

## Driving it with verify-app

Use the shared-device queues in `docs/agents/device-qa.md`; Android uses `scripts/android-qa.ps1`. Only an explicit Human-authorized separate emulator lane may run concurrently. Launch the assigned isolated Host with `scripts/verify-app.mjs`, doctor it and pair the dev client with a private one-time offer. Background editing itself needs no model or live Host connection after the known scope is available. Drive native controls by their accessible labels, retaining XML/accessibility snapshots and screenshots. `apps/mobile/test/chat-background.test.ts`, `native-chat-background.test.ts`, `chat-background-editor.test.tsx`, `background-render.test.tsx` and `background-position.test.ts` provide deterministic failure/geometry coverage; they are not native proof.

1. With a neutral owned picture on the phone, open a DM's Chat background. Choose photo through the system picker; verify Fill, centered position and 60% fade. Before Done, the conversation still has its saved canvas. Save, leave the sheet, and inspect the actual conversation.
2. Delete the library original, end the app process, cold-open the same chat and verify the owned picture remains. Privately read the local `chat-backgrounds/settings` complete record and owned image under the app's document directory. Do not print unrelated app files or credentials. The preference contains an owned basename, Host/Channel scope, fit, normalized position and fade, with no absolute picker path.
3. Replace an image then cancel; repeat using native back and sheet dismissal. Saved metadata and chat remain unchanged. Copy/decode/write failures are injected at the deterministic adapter seam; record native missing-file fallback separately by removing only the task's own fixture image, then replace it through the picker.
4. Choose a default solid/photo in Settings. A chat with no override follows it, another chat retains its override, and Use default removes only that chat's override on Done. Repeat the group entry point. Restore the global theme canvas and confirm the override survives. Keep two Hosts' same-looking Channel IDs separate in owner coverage.
5. Use wide/tall fixtures: Fit shows every edge with the theme matte, Fill crops proportionally, drag moves only cropped axes, and position survives save/reopen. Adjust the named position controls and Center image. At 0/60/100% fade inspect picture, bubbles, attachments and controls. Switch preview light/dark without changing system appearance or committed state.
6. On each native platform, check light/dark × default/intermediate/maximum system text. Scroll to every option/error and activate Done/cancel. Open the real soft keyboard in an existing chat draft, enter multiple lines and move the caret; capture keyboard open/closed with identical image landmarks. Background composition, history and draft remain stable. Stream a real reply, read history and use return-to-latest and attachment controls. Report Human feedback separately.

## Observable proof

The native picker/editor action, rendered chat, complete local metadata and owned image agree; cold restart after removing the source picture preserves the result. Cancellation/failure retains the prior committed choice. The corresponding Host Channel timeline is unchanged by editing, except messages explicitly sent as part of the test. Android evidence does not qualify iOS.

## Gotchas

- Dev clients must match SDK58 native inputs; never load SDK58 JS in an SDK57 binary.
- Never publish the one-time pairing link, Host token, raw private app store, unrelated chats or device identifiers. Use neutral owned fixtures in PR screenshots.
- A native device/queue unavailable to the agent remains explicitly untested. Source tests and web export do not close that gap.
- Live ADB font-scale changes reproduce the existing SDK58 development-client navigation warning in [#2110](https://github.com/BotHarness/DeepSeekBot/issues/2110), including on the pre-background baseline. Cold-launch size checks do not qualify live-resize draft retention; record that case separately.
