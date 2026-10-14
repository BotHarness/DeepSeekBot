# Bot mode entry and the default DeepSeek Bot

Bot mode swaps the native DSH session view for the BotHarness Messages sidebar and conversation view. On the first entry into a fresh Profile, the product creates a default DeepSeek Bot and opens its DM with a welcome letter.

## Sub-features

- `enter` switches from the native view to Bot mode.
- `default-bot` creates DeepSeek Bot and its DM on first entry.
- `welcome-letter` shows the welcome letter with suggested replies, a model chooser and Create Bot.
- `getting-started` opens the tutorial checklist.

## How to get to it (user POV)

- Choose `Bot mode` in the global sidebar.
- Choose `Bot mode` again to return to the native view.

## Driving it with verify-app

Preconditions: a fresh instance that passes `doctor`.

- **Enter.** Run `node scripts/verify-app.mjs shot bot-mode --name <n> --bot-mode`. The ARIA file has `StaticText "Messages"` and `button "Bot settings"`.
- **Default Bot.** Run the same command a second time. The ARIA file has a button whose name starts with `DeepSeek Bot`, a `textbox "Message DeepSeek Bot"` and `button "Create Bot"`.
- **Canonical state.** Run `node scripts/verify-app.mjs rpc botharness/list --name <n>`. `bots` holds one entry with `displayName` `DeepSeek Bot`.
- **Tutorial.** Add `--keep-overlays`. The screenshot shows the `Get started with DeepSeekBot` checklist.

## Gotchas

- The default Bot appears asynchronously. The first `--bot-mode` capture on a fresh Profile can show `No Bots yet.` with `Create the first Bot`. Capture again before calling it missing.
- `.bh-root` alone does not mean Bot mode: the Window Companion stage carries it too. `verify-app` waits for `.bh-root.bh-main`.
- The preview notice is modal and hides the rest of the page from the accessibility tree until it is dismissed.
- On a keyless Host, the native `Add an API key to get started` dialog can appear over Bot mode. `verify-app` chooses `Configure later` unless `--keep-overlays` is set.
