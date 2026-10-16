# Bot DM reply

A Human sends a message in a Bot's DM, the Bot runs a session on its configured model, and its reply lands in the same DM.

## Sub-features

- `send` posts the Human message from the composer.
- `run` starts the Bot's session, visible in the Channel sidebar `Sessions` tab as `Running`.
- `reply` commits the Bot's answer to the DM timeline.

## How to get to it (user POV)

- Enter Bot mode, open the `DeepSeek Bot` DM, type in `Message DeepSeek Bot`, press Enter.

## Driving it with verify-app

Preconditions: `launch` reported a model credential, `doctor` passes, and the default DeepSeek Bot exists (see [bot-mode.md](bot-mode.md)).

- **Scripted model path.** `node scripts/e2e-llm-scenarios.mjs --name <n> --scenario dm-reply --model host-default` checks the model/API path; the composer path below is a separate UI proof.
- **Send and wait.** Run `node scripts/verify-app.mjs shot dm-reply --name <n> --bot-mode --fill "Message DeepSeek Bot=What is 6 times 7? Answer with digits only." --press Enter --wait-text 42`. The step list ends with `saw text "42"`, and the screenshot shows the Human message and the Bot reply.
- **Canonical state.** Get the slug from `rpc botharness/list`, then the Channel id from `rpc botharness/channelDm '{"slug":"<slug>","displayName":"DeepSeek Bot"}'`, then run `rpc botharness/channelTimeline '{"channelId":"<id>"}'`. The entries end with a `human` entry holding the prompt and a `bot` entry holding the reply.

## Gotchas

- The bottom-right Window Companion covers the `Send` button at 1440×900, so `--click Send` lands on the companion. Press Enter instead.
- `--wait-text` ignores the composer value but matches the sent Human message. A reply word that also appears in the prompt passes before the Bot answers.
- On a keyless Host the message sends and the session fails. That is a missing precondition, not a product failure.
- `--click-text "DeepSeek Bot"` matches the conversation header chip last and opens the Bot profile popover. The DM is already selected on first entry.
