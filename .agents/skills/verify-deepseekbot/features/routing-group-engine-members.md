# Subscription Engines in Routing Groups

## Sources

- `packages/core/src/models/{routing-groups,group-fallback}.ts`
- `packages/client/src/client/routing-group-settings.tsx`
- `packages/client/src/client/model-menu.tsx`
- `apps/mobile/src/ui/chat/model-picker-row.tsx`
- `apps/mobile/src/ui/chat/routing-group-editor.tsx`

## Terms

- Routing Group
- Subscription Engine

## Sub-features

- A saved engine member uses the model brand, short model name or engine default, full subscription source, and puzzle-piece icon. The editor gives every member a position and dims unavailable engines with a reason.
- The group picker shows the current DSH route. Its accessible name reads the current route and the full saved member order.
- The desktop and phone editors add, reorder, and remove engine members. The main model picker presentation lists **Codex** and **Claude Code** in separate sources. “Default” marks the real default. Each new engine member saves a concrete model ID and its optional reasoning effort. A legacy member without a model shows the engine’s current default. Removed models display an unavailable reason.
- Reopening the picker or returning to an engine source refreshes availability and leaves existing choices visible until the Host responds. A failed read shows Retry and preserves the editor draft. Search matches terms across the engine and model fields.
- Saving a group that expands to zero DSH models shows the Host refusal inline and keeps the draft.

## How to get to it (user POV)

On desktop open Bot settings → Models & execution → Routing Groups. On a paired phone open Settings → Models and presets → Routing Groups. Open a group, then **Add member** → **Codex subscription** or **Claude Code subscription**. You can also search across sources in **All models**.

For the group picker, open the global default model picker on desktop or a Bot's model picker on phone. Use the Routing Groups filter.

## Driving it with verify-app

1. Launch and check an isolated Host. Sign Codex in with a ChatGPT subscription or fixture its installed, signed-in status and `gpt-5.4` model catalog. Leave Claude Code signed out or fixture that status. Seed a Routing Group with `opencode-go/deepseek-v4.1-flash`, Codex `gpt-5.4`, and the Claude Code default in that order through `deepseekbot model-group-create --members-stdin`. Use a configured catalog route and avoid sending messages. Use a second listed Codex model for the add journey, and give the Claude fixture a default model when checking legacy rows.
2. Open each group picker and verify that only the current DSH route is visible under the name. Read the accessible name and check the full ordered list. The expanded DSH routes and the saved members are available from `deepseekbot model-group <id>`.
3. In each editor verify the same member order, the short model title, and the muted Claude Code row with its sign-in reason. Open **Add member** and check the two engine sources against `deepseekbot engine status` and `deepseekbot engine models <engine>`. Search for a Codex model using words from both the source and the model. Select a model with reasoning effort, choose a supported level, move it, remove a different engine, and save. Confirm a legacy member with no model shows the current default once the catalog arrives. Confirm a saved model absent from the catalog shows the unavailable reason. Read back the new member order and revision. Before testing the second editor, restore the original three members using the current revision, or seed a separate group with the same original members.
4. Remove the last DSH model and save. Verify the inline refusal, retained draft, and unchanged stored revision. Add the model back before saving.
5. Capture the editor, group picker, and Add member picker in both themes. Use the paired Expo Web preview for a phone layout comparison. Use the shared device queue for native results.

## Gotchas

- A task-local engine status fixture can exercise installed, signed-out, and model-list cases without a paid account or a model call. Label the evidence with the fixture and use the regular Host API and editor to verify persistence.
- The released Host selects a DSH route from the expanded model list. Engine execution and readiness at the turn boundary are tracked separately in [#4574](https://github.com/BotHarness/DeepSeekBot/issues/4574).
- Before downgrading to a Host that predates engine members, remove them from saved Routing Groups using the current CLI.
