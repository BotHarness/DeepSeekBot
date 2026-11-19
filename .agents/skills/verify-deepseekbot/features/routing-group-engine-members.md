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

- A saved engine member uses the model brand, short model name or engine default, full subscription source, and puzzle-piece icon.
- The group picker shows the current DSH route. Its accessible name reads the current route and the full saved member order.
- The desktop and phone editors add, reorder, and remove engine members. **Subscription Engines** shows a default and the models the Host reports for each signed-in engine. Other engines show a disabled row with a reason.
- Saving a group that expands to zero DSH models shows the Host refusal inline and keeps the draft.

## How to get to it (user POV)

On desktop open Bot settings → Models & execution → Routing Groups. On a paired phone open Settings → Models and presets → Routing Groups. Open a group, then **Add member** → **Subscription Engines**. On desktop the puzzle-piece filter is named **Subscription Engines**.

For the group picker, open the global default model picker on desktop or a Bot's model picker on phone. Use the Routing Groups filter.

## Driving it with verify-app

1. Launch and check an isolated Host. Seed a Routing Group with `opencode-go/deepseek-v4.1-flash`, Codex `gpt-5.4`, and the Claude Code default in that order through `deepseekbot model-group-create --members-stdin`. Use a configured catalog route and avoid sending messages.
2. Open each group picker and verify that only the current DSH route is visible under the name. Read the accessible name and check the full ordered list. The expanded DSH routes and the saved members are available from `deepseekbot model-group <id>`.
3. In each editor open **Add member** → **Subscription Engines**. Compare the choices to `deepseekbot engine status` and `deepseekbot engine models <engine>`. Add an available engine default or model, move it, remove a different engine, and save. Read back the new member order and revision.
4. Remove the last DSH model and save. Verify the inline refusal, retained draft, and unchanged stored revision. Add the model back before saving.
5. Capture the editor, group picker, and Add member picker in both themes. Use the paired Expo Web preview for a phone layout comparison. Use the shared device queue for native results.

## Gotchas

- A task-local engine status fixture can exercise installed, signed-out, and model-list cases without a paid account or a model call. Label the evidence with the fixture and use the regular Host API and editor to verify persistence.
- The released Host selects a DSH route from the expanded model list. Engine execution and readiness at the turn boundary are tracked separately in [#4574](https://github.com/BotHarness/DeepSeekBot/issues/4574).
- Before downgrading to a Host that predates engine members, remove them from saved Routing Groups using the current CLI.
