# #1735 per-message hover time — visual evidence

Final source commit: `22a16f44e0dbcba23c5d69dffbb1db44e619310c`
Base revision: `87340ee0eb3edd7bd1a2438b992a44af54048931`
Parent implementation commit for the matched pair: `1b56886`

All images use synthetic, task-owned DSH data: Bot "Tob" in a DM with two merged messages around a minute boundary. No Human messages, credentials, or private fixtures are shown.

## Environment

- Windows 10.0.26200 x64, Node v24.16.0, pnpm 12.4.2, local DSH `0.2.1-rc.2`
- Isolated Hosts launched with `node scripts/verify-app.mjs launch --name <name>`
- Browser: Microsoft Edge 155.0.4283.62 headless through Puppeteer 25.11.0, `--lang=en-US`, English UI
- Viewport: 1280 × 800 for desktop light/dark; 390 × 844 with `isMobile`/`hasTouch` for touch
- Theme: `prefers-color-scheme` light or dark, applied before reload
- Model: not configured and not needed

## Commands for the final evidence

```bash
node scripts/verify-app.mjs launch --name hover-time-final
BH_E2E_INSTANCE=.humanlayer/verify/hover-time-final/instance.json \
PUPPETEER_EXECUTABLE_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
BH_E2E_REQUIRE_CLEAN=1 node scripts/e2e-message-hover-time.mjs
```

Result: `PASS E:\codes\dshbot\.humanlayer\verify\hover-time-final\evidence\hover-time-1792429521979`, with `sourceCommit` = `22a16f4…` and `dirty` = `""`.

The final E2E seeded the pair with `botharness/botToolRun` (`channel_send`), then asserted:

- second message: own `01:06 AM` (`01:05 AM` first message), left of the bubble, bubble rect unchanged within 0.5px on hover
- first message: group header time `01:05 AM` stays in place; no per-message time appears
- pointer-away: second message time opacity returns to `0`
- reaction chip: time bottom `661.5` = bubble bottom `661.5`, chip top `665.5`
- selection mode: `.bh-bubble-side` is `display: none`, avatar opacity `1`
- 390px touch: `(hover: none)` true, hover time `display: none`, avatar opacity `1`, group time opacity `1`
- dark theme: hover time opacity `1`, avatar opacity `0`, reaction chip present
- no page errors or console errors

## Matched placement pair

Captured from the same Host data (same message IDs, `10:20 PM` / `10:21 PM`), viewport, theme, locale and hover state:

- `before-second-hover-light.png` / `before-second-hover-dark.png` — base `87340ee`: the time sits to the right of the bubble and the group avatar stays visible.
- `after-second-hover-light.png` / `after-second-hover-dark.png` — parent `1b56886`: the time sits in the left avatar column and the group avatar yields the slot without moving the bubble.

The final commit only adds the reaction-row compensation; the no-chip rendering in this pair is unchanged.

## Final-run states

- `final-second-hover-light.png` — final `22a16f4` fresh Host, second message hovered with no reaction chip.
- `final-second-hover-reaction-light.png` / `final-second-hover-reaction-dark.png` — final `22a16f4`, reaction chip under the message: the time remains on the bubble bottom in both themes.
- `final-first-hover-light.png` — first message hover: the existing group header time appears, the avatar stays, and no per-message time is added.
- `final-selection-mode-light.png` — selection mode: the hover time is not rendered and the avatar remains.
- `final-narrow-touch-390x844.png` — 390 × 844 touch layout: no hover-dependent time remains visible.
