# Bot-to-Bot Group mentions and wake

A PersonaBot in a Group mentions a colleague, the colleague shows as a mention badge and wakes, even when its Group wake policy is `mentions`. This is how a coordinator Bot hands out work and how workers report back.

## Sub-features

- `mention by ID`: `channel_send` with `mention_bot_ids`.
- `mention by name`: `channel_send` whose body has `@` and a joined colleague's exact display name. The Host turns it into the same mention.
- `wake`: the mentioned Bot gets a `group-mention` Inbox Admission and a run, once per sender and recipient in one causation chain.

## How to get to it (user POV)

- Create a Group with two or more Bots, open each member's wake setting in the Group and choose mentions only, then mention one Bot and ask it to report to another with `@`.

## Driving it with verify-app

Preconditions: `launch` reported a model credential and `doctor` passes.

- **Scripted.** `node scripts/e2e-llm-scenarios.mjs --name <n> --scenario worker-reports-to-coordinator` (add `two-workers-report`, `coordinator-delegates`). It creates fresh Bots, a mentions-only Group and the Human message, then waits for the proof. Add `--runs <n> --model <provider/model>` (repeatable) to compare pass rate and tokens across models.
- **Canonical state.** `rpc botharness/channelMessages '{"channelId":"<group>"}'`. The worker's message carries `mentions` with the coordinator's `botSlug`, and `deliveries` lists that slug as `handled`.
- **Visible result.** `shot` the Group: the coordinator's name renders as a badge with its avatar at the start of the worker's message, not as plain `@` text.

## Gotchas

- The model's wording varies; assert on `mentions` and `deliveries`, never on the reply text.
- Two members with the same display name make a typed `@Name` fail the send with both IDs; the Bot is told to retry with `mention_bot_ids`.
- A Bot mentioning the same colleague twice in one chain wakes it once; that is the loop guard, not a lost message.
