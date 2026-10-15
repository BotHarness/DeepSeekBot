# Bot mode entry and the default DeepSeek Bot

Bot mode swaps the native DSH session view for the BotHarness conversation view. On desktop (960 px and wider) it also replaces the whole left column with the Bot mode sidebar (ADR-0203). On the first entry into a fresh Profile, the product creates a default DeepSeek Bot and opens its DM with a welcome letter.

## Sub-features

- `enter` switches from the native view to Bot mode.
- `sidebar` is the desktop Bot mode sidebar: a `DeepSeekBot` header, pinned panel cards (one per Dock panel, Activity Center first with its unread count), the Messages Roster and Bot settings, in the column DSH sizes and collapses. A card toggles its panel in the dock and is pressed while the panel is open; before a Channel is open only the Activity Center card works, and it opens the full Activity Center page.
- `exit` leaves Bot mode with the header logo, which morphs into **Exit Bot mode** on hover or keyboard focus, and brings back the native left column.
- `default-bot` creates DeepSeek Bot and its DM on first entry.
- `welcome-letter` shows the welcome letter with suggested replies, a model chooser and Create Bot.
- `getting-started` opens the tutorial checklist.

## How to get to it (user POV)

- Choose `Bot mode` in the global sidebar.
- On desktop, choose the logo at the top left of the Bot mode sidebar (its accessible name is `Exit Bot mode`) to return to the native view. Between 760 and 960 px wide, the native sidebar stays and `Bot mode` is chosen again instead.

## Driving it with verify-app

Preconditions: a fresh instance that passes `doctor`.

- **Enter.** Run `node scripts/verify-app.mjs shot bot-mode --name <n> --bot-mode`. The ARIA file has `StaticText "Messages"` and `button "Bot settings"`.
- **Default Bot.** Run the same command a second time. The ARIA file has a button whose name starts with `DeepSeek Bot`, a `textbox "Message DeepSeek Bot"` and `button "Create Bot"`.
- **Canonical state.** Run `node scripts/verify-app.mjs rpc botharness/list --name <n>`. `bots` holds one entry with `displayName` `DeepSeek Bot`.
- **Sidebar and exit.** Run `BH_E2E_INSTANCE=.humanlayer/verify/<n>/instance.json node scripts/e2e-bot-mode-sidebar.mjs`. It checks that the Bot mode sidebar fills the column with no native `Bot mode` row, selects a Roster row, opens and closes the Activity Center panel from its pinned card (`[data-pinned-panel="activity-center"]`), collapses and reopens the rail, then exits and checks that `New Session`, `Plugins` and `Settings` are back. It prints `BOT MODE SIDEBAR PASS`.
- **Exit by hand.** Run `node scripts/verify-app.mjs shot exit --name <n> --bot-mode --click "Exit Bot mode" --wait "Plugins"`. The ARIA file has `button "Bot mode"` and `button "Plugins"` again.
- **Tutorial.** Add `--keep-overlays`. The screenshot shows the `Get started with DeepSeekBot` checklist.

## Gotchas

- `shot` waits for a `Settings` button with visible text, so it cannot start below 1024 px, where DSH shows the rail. Drive narrow widths with a Puppeteer page that resizes after entering Bot mode.
- The Bot mode sidebar is labelled `Bot mode` as a navigation landmark, so `aria("Bot mode")` also matches it inside Bot mode. Use `button[aria-label="Bot mode"]` to target the native row.

- The default Bot appears asynchronously. The first `--bot-mode` capture on a fresh Profile can show `No Bots yet.` with `Create the first Bot`. Capture again before calling it missing.
- `.bh-root` alone does not mean Bot mode: the Window Companion stage carries it too. `verify-app` waits for `.bh-root.bh-main`.
- The preview notice is modal and hides the rest of the page from the accessibility tree until it is dismissed.
- On a keyless Host, the native `Add an API key to get started` dialog can appear over Bot mode. `verify-app` chooses `Configure later` unless `--keep-overlays` is set.
