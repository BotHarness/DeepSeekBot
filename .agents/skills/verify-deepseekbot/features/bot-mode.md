# Bot mode entry and the protected Tob

Bot mode swaps the native DSH session view for the BotHarness conversation view. On structurally qualified Web/macOS/Windows windows at least 961px wide it opens the [workspace](bot-mode-dock.md); expanded shells without the Dock retain the Bot mode sidebar fallback (ADR-0203). Medium windows (600–839px) dock the sidebar beside the conversation. Compact windows (below 600px) open the same sidebar in a drawer. On the first entry into a fresh Profile, the product prepares protected Tob; its DM is a Channel list row. See [the protected Tob DM](tob-home.md) for the current first-run journey. Existing ordinary DeepSeek Bots and their welcome letters remain unchanged.

## Sources

- `packages/client/src/client/{bot-mode-prefs,bot-mode-setting-rows,bot-mode-sidebar,bot-mode-sidebar-viewport,pinned-panel-cards}.{ts,tsx}`
- `packages/client/src/client/{onboarding,onboarding-checklist,onboarding-checklist-view,onboarding-view}.{ts,tsx}`
- `packages/client/src/client/{mobile-bot-panel.tsx,mobile-bot-styles.ts,mobile-conversation-header.tsx}`
- `packages/core/src/onboarding/*.ts`

## Terms

- Tob
- Bot mode layout
- Workspace Control Rail
- Roster

## Sub-features

- `enter` switches from the native view to Bot mode.
- `sidebar` is the desktop Bot mode sidebar: a `DeepSeekBot` header, pinned panel cards (one per Dock panel, Activity Center first with its unread count), the Messages Roster and Bot settings, in the column DSH sizes and collapses. A card toggles its panel in the dock and is pressed while the panel is open; before a Channel is open only the Activity Center card works, and it opens the full Activity Center page.
- `compact-sidebar` opens a modal drawer from **Open sidebar**. The drawer exposes the same Messages Roster, Activity, Bot settings and exit. Choosing a conversation closes it. Escape, the close button and the scrim close it and return focus to the opener.
- `bottom-return` adds a permanent **Back to Harness / 返回 Harness** icon directly below Bot settings in the qualified wide workspace Control Rail, using the same exit operation as the top logo. It remains visible without hover or tutorial completion.
- `exit` leaves Bot mode with the header logo, which morphs into **Exit Bot mode** on hover or keyboard focus, and brings back the native left column.
- `default-bot` prepares Tob and its DM on first entry.
- `welcome-letter` preserves the older DeepSeek Bot welcome; fresh Tob uses a once-only fixed greeting.
- `getting-started` opens the tutorial checklist.

## How to get to it (user POV)

- Choose `Bot mode` in the global sidebar.
- On desktop, choose the logo at the top left of the Bot mode sidebar (its accessible name is `Exit Bot mode`) to return to the native view. At compact width, open the drawer first.

The workspace rail carries the exit control and panel switches; the independent Channel list carries the Roster. Both remain available without a selected Channel.

## Driving it with verify-app

Preconditions: a fresh instance that passes `doctor`. For the qualified workspace run `scripts/e2e-panel-workspace.mjs` as described in [the workspace feature](bot-mode-dock.md); the old sidebar journey below applies to fallback shells only.

- **Enter.** Run `node scripts/verify-app.mjs shot bot-mode --name <n> --bot-mode`. The ARIA file has `StaticText "Messages"` and `button "Bot settings"`.
- **Default Bot.** Run the same command a second time. The ARIA file has a Tob row in the Channel list; selecting it reveals `Message Tob`.
- **Canonical state.** Run `node scripts/verify-app.mjs rpc botharness/list --name <n>`. `bots` holds one entry with `displayName` `Tob`.
- **Observation.** Keep the page open and run `node scripts/verify-app.mjs observe --name <n>` before entering Bot mode, inside it and after exiting. A healthy transition keeps `client.state` at `shell-ready`; a visible Bot mode main surface replaces the native sidebar marker. Inspect the DOM and any first failure separately.
- **Sidebar and exit.** Run `BH_E2E_INSTANCE=.humanlayer/verify/<n>/instance.json node scripts/e2e-bot-mode-sidebar.mjs`. It checks that the Bot mode sidebar fills the column with no native `Bot mode` row, selects a Roster row, opens and closes the Activity Center panel from its pinned card (`[data-pinned-panel="activity-center"]`), collapses and reopens the rail, then exits and checks that `New Session`, `Plugins` and `Settings` are back. It waits for the Channel content, checks `shell-ready` before entry, inside Bot mode, with Activity Center open, with the rail collapsed and after exit, and saves `client-observations.json` beside the screenshots. It prints `BOT MODE SIDEBAR PASS`. Each invocation writes a distinct `attempt-<time>-<pid>/` evidence directory so retries retain earlier results. Failed runs preserve `failure.png`, `failure-aria.json`, `page-errors.json` and `failure-observation.json` (the failing step and bounded diagnostic snapshot) before closing the browser.
- **Compact keyboard path.** Run `BH_E2E_INSTANCE=.humanlayer/verify/<n>/instance.json node scripts/e2e-bot-mode-exit.mjs`. At 720px it measures separate sidebar and Messages columns. At 400px it opens the drawer with Enter and Space, checks focus stays inside, closes it by Escape, the close button and the scrim, and checks focus returns.
- **Exit by hand.** Run `node scripts/verify-app.mjs shot exit --name <n> --bot-mode --click "Exit Bot mode" --wait "Plugins"`. The ARIA file has `button "Bot mode"` and `button "Plugins"` again.
- **Tutorial.** Add `--keep-overlays`. The screenshot shows the `Get started with DeepSeekBot` checklist.

## Gotchas

- On macOS, Chrome can keep the OS language despite `--lang=en-US`; this journey uses a CDP language override so its English accessible-name assertions are deterministic. A selector timeout with a healthy shell needs the saved ARIA tree before diagnosis.

- Use `shot --bot-mode --size 400x860 --click "Open sidebar"` for a compact drawer capture.
- The Bot mode sidebar is labelled `Bot mode` as a navigation landmark, so `aria("Bot mode")` also matches it inside Bot mode. Use `button[aria-label="Bot mode"]` to target the native row.

- The default Bot appears asynchronously. The first `--bot-mode` capture on a fresh Profile can show `No Bots yet.` with `Create the first Bot`. Capture again before calling it missing.
- `.bh-root` alone does not mean Bot mode: the Window Companion stage carries it too. `verify-app` waits for `.bh-root.bh-main`.
- The preview notice is modal and hides the rest of the page from the accessibility tree until it is dismissed.
- On a keyless Host, the native `Add an API key to get started` dialog can appear over Bot mode. `verify-app` chooses `Configure later` unless `--keep-overlays` is set.

## Bottom return (#2289)

Run `BH_E2E_INSTANCE=<task-instance.json> node scripts/e2e-bot-mode-exit.mjs` against the task-owned isolated Host. It requires no model call. The journey verifies the visible resting button beneath settings, pointer and Enter/Space exit, native navigation restoration, remembered manual exit after reload, remembered Bot mode after re-entry/reload, unchanged PersonaBot facts and saved layout, the original logo exit, a short window and narrow/wide transitions. Each attempt keeps screenshots, accessibility snapshots, console logs and Client observations.

For a before/after pair, the unmodified main run must fail specifically because the final rail button is still Bot settings. A shell/plugin startup failure is not this regression. Inspect both themes and localized tooltips, move the Control Rail and preserve a real conversation draft in the actual Client; save separate native Desktop evidence when available. Browser evidence does not qualify a native window.
