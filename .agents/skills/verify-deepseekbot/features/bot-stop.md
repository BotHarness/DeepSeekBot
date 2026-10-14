# Stop a working Bot

A Human stops a PersonaBot's running Orchestrator turn. The Host cancels the turn, the Bot goes idle, and the conversation records `Human stopped <Bot>`.

## Sub-features

- `web` turns the composer's Send button into `Stop <Bot>` while a Bot in the DM or Group Channel is thinking or working and the composer is empty. In a Group Channel it reads `Stop <n> Bots` and stops each of them.
- `cli` stops the same turn with `deepseekbot channel-bot-stop <channel> --bot <id>`.
- `refused` answers `not-working` when the Bot has no running Orchestrator turn; the Web Client shows that as a short notice above the composer.

## How to get to it (user POV)

- Enter Bot mode, open the `DeepSeek Bot` DM, send a long task, wait for the square Stop button where Send was, and press it.

## Driving it with verify-app

Preconditions: `launch` reported a model credential and `doctor` passes.

- **Scripted journey.** `node scripts/e2e-web-stop.mjs` (instance name from `BH_E2E_NAME`, default `webstop`) sends a counting task, waits for `Stop DeepSeek Bot`, checks that typing turns it back into `Send`, presses Stop from the keyboard, and checks the stop line, the Bot's `idle` state, no new entries for 15 s and a `not-working` second stop, in light and dark. `--before` captures a build without the button. Evidence lands in `.humanlayer/verify/<n>/evidence/web-stop/`.
- **Canonical state.** `rpc botharness/channelTimeline '{"channelId":"dm-<slug>"}'` ends with a system entry carrying `turnStop`.

## Gotchas

- The Window Companion covers the Send/Stop slot at 1440×900, so a mouse click by accessible name lands on the companion. The journey focuses Stop with Tab and presses Enter, and hides the companion only for its screenshots.
- `opencode-go/deepseek-v4-flash` counts to 400 in about a minute. Ask for a longer range so the Bot is still working when the page loads.
