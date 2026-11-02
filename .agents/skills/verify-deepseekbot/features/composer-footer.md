# Composer footer and reply speed

## Sub-features

- Web defaults to model/workspace on the left and token usage on the right. Generation speed, including per-reply labels, is off by default.
- Right-click or long-press the footer, or focus it and press Shift+F10, to open its visibility panel, arrange the layout or restore defaults. Switches keep the panel open. The `/footer` composer shortcut also opens it, even after all items are hidden.
- Arrange mode supports pointer dragging with an insertion marker. Arrow keys reorder the focused item; Ctrl/Command + arrows move it left/right. Escape or an outside click finishes.
- Preferences persist in this browser's localStorage and synchronize between same-origin tabs. They do not change Host permissions or other devices.
- The footer stays on one line with ellipsis on long labels. At 480px or less of footer width, model/workspace controls collapse to icons with full names in tooltips and accessible labels; numeric usage/speed stays visible. Phone-width Web uses the same visible items and ordering: model/workspace/usage in DMs, workspace in groups, plus optional speed in either. Buttons remain compact at 28px high on touch screens too. Hiding every applicable item collapses the entire footer and moves the input down.
- Optional speed labels use a completed model step. Reply and footer labels both show only a number followed by `tps` (for example `36 tps`), with no average or approximation prefix. The average is bounded to 20 measured replies within 200 messages and at most four pages. No timer, per-token query or hidden history scan is used.

## How to get to it (user POV)

Open a Bot DM in Bot mode. The footer sits below the message input. Right-click or long-press its blank area or a chip to open Footer settings. In a group, the same panel offers workspace and speed only. Type `/footer` and select the shortcut to recover a hidden footer.

## Driving it with verify-app

Launch an isolated named Host and run doctor. Use its dedicated QA Bot and the real model path in [bot-dm-reply.md](bot-dm-reply.md) to obtain one completed reply.

1. Read the saved ARIA snapshot and right-click the group named by `composerContext.label`. The panel offers model, workspace, token usage and speed switches, plus arrange and reset.
2. Toggle Generation speed. Both the reply label and average chip appear only when canonical `botharness/channelTimeline` contains usable `perf` values. Toggle it off and confirm both disappear.
3. Choose Arrange footer. Move a chip before another and between `[data-footer-side]` zones with pointer down/move/up. Capture the insertion indicator before release. Check final DOM order and `botharness.composer-footer.v1` in browser storage.
4. On phone-width Web, tap model/workspace/usage and close each dialog; keep dialogs within the viewport. Enable speed and verify all four DM items, then disable it and verify three. Verify the group workspace control opens its dialog.
5. Move the focused item using arrows and Ctrl/Command+arrows. Press Escape, reload, and check the saved order. Long-press a chip for at least 550ms and confirm settings opens without also activating the chip. A short tap keeps its normal action; movement, release, pointer cancellation and a second touch cancel the hold. Hide every item, close the panel and confirm the footer has zero height and the input moves down. Reload, type `/footer`, select the shortcut, and restore defaults; verify saved preferences and that the shortcut is removed from the draft. Check DM and group independently.
6. At desktop and 900/820/760/390px widths, compare button top coordinates, footer clientWidth/scrollWidth and computed ellipsis styles; capture light/dark evidence. Long labels must not wrap or overflow. At 480px and below, check model/workspace label visibility, accessible names and click behavior; resize the desktop Dock panel as well as the viewport, and widen it again to restore labels.
7. Count timeline network requests while toggling and streaming: hidden idle makes no speed query; enabling does one bounded scan; text chunks and Human messages do not trigger another. Check the console after the journey.

## Gotchas

- Provider quota can prevent a real speed measurement even while UI/API checks pass. Preserve the failure; use an already configured test route if available, and distinguish a real reply from a fixture.
- The source PR showed speed by default. Current defaults deliberately hide both average and per-reply labels.
- A temporary localStorage write failure leaves settings usable in memory for the current page. A fresh page uses defaults if no valid stored preferences exist.

- When capturing a pointer drag with Puppeteer, use `captureBeyondViewport: false`. The default clipped screenshot can briefly resize even a blank page to 1×1, switch responsive layouts and cancel the drag. Wait for visible controls instead of network-idle on the live SSE Client.
