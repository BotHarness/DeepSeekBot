# Composer footer and reply speed

## Sub-features

- Desktop Web defaults to model/workspace on the left and token usage on the right. Generation speed, including per-reply labels, is off by default.
- Right-click the footer, or focus it and press Shift+F10, to toggle its four items, arrange the layout or restore defaults.
- Arrange mode supports pointer dragging with an insertion marker. Arrow keys reorder the focused item; Ctrl/Command + arrows move it left/right. Escape or an outside click finishes.
- Preferences persist in this browser's localStorage and synchronize between same-origin tabs. They do not change Host permissions or other devices.
- The footer stays on one line with ellipsis on long labels. Phone-width Web retains the compact model-only DM footer; group footers remain hidden.
- Optional speed labels use a completed model step. Estimated counts are labeled. The average is bounded to 20 measured replies within 200 messages and at most four pages. No timer, per-token query or hidden history scan is used.

## How to get to it (user POV)

Open a Bot DM in Bot mode. The footer sits below the message input. Right-click its blank area and select Generation speed or Arrange footer. In a group, the same menu offers workspace and speed only.

## Driving it with verify-app

Launch an isolated named Host and run doctor. Use its dedicated QA Bot and the real model path in [bot-dm-reply.md](bot-dm-reply.md) to obtain one completed reply.

1. Read the saved ARIA snapshot and right-click the group named by `composerContext.label`. The menu offers model, workspace, token usage, speed, arrange and reset.
2. Toggle Generation speed. Both the reply label and average chip appear only when canonical `botharness/channelTimeline` contains usable `perf` values. Toggle it off and confirm both disappear.
3. Choose Arrange footer. Move a chip before another and between `[data-footer-side]` zones with pointer down/move/up. Capture the insertion indicator before release. Check final DOM order and `botharness.composer-footer.v1` in browser storage.
4. Move the focused item using arrows and Ctrl/Command+arrows. Press Escape, reload, and check the saved order. Hide every item and confirm the remaining empty footer can still open its menu and restore defaults.
5. At desktop and 900/820/760/390px widths, compare button top coordinates, footer clientWidth/scrollWidth and computed ellipsis styles; capture light/dark evidence. Long labels must not wrap or overflow.
6. Count timeline network requests while toggling and streaming: hidden idle makes no speed query; enabling does one bounded scan; text chunks and Human messages do not trigger another. Check the console after the journey.

## Gotchas

- Provider quota can prevent a real speed measurement even while UI/API checks pass. Preserve the failure; use an already configured test route if available, and distinguish a real reply from a fixture.
- The source PR showed speed by default. Current defaults deliberately hide both average and per-reply labels.
- A temporary localStorage write failure leaves settings usable in memory for the current page. A fresh page uses defaults if no valid stored preferences exist.

- When capturing a pointer drag with Puppeteer, use `captureBeyondViewport: false`. The default clipped screenshot can briefly resize even a blank page to 1×1, switch responsive layouts and cancel the drag. Wait for visible controls instead of network-idle on the live SSE Client.
