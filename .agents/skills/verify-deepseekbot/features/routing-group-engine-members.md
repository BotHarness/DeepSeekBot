# Subscription Engines in Routing Groups

## Sources

- `packages/core/src/models/{routing-groups,group-fallback}.ts`
- `packages/core/src/models/routing-group-engine-options.ts`
- `packages/core/src/runtime/{bot-runtime,dsh-bot-agent-adapter}.ts`
- `packages/core/src/engines/engine-host.ts`
- `packages/client/src/client/turn-stop-line.tsx`
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
- The desktop and phone editors add, reorder, and remove engine members. **Subscription Engines** shows a default and the models the Host reports for each signed-in engine. Other engines show a disabled row with a reason.
- Reopening **Subscription Engines** refreshes availability and leaves existing choices visible until the Host responds. A failed read shows Retry and preserves the editor draft. Search matches terms across the engine and model fields.
- Saving a group that expands to zero DSH models shows the Host refusal inline and keeps the draft.
- The local Orchestrator runs the first ready target in a mixed group. After quota, the next ready engine or DSH model continues the same request in the same Session, using completed tool results. A reply already sent for the original Source Event is protected against a second send. Assignment and Subagent choices use the group's DSH route projection.
- The Channel shows one limit card when every target rests. The card gives the earliest reset time.

## How to get to it (user POV)

On desktop open Bot settings → Models & execution → Routing Groups. On a paired phone open Settings → Models and presets → Routing Groups. Open a group, then **Add member** → **Subscription Engines**. On desktop the puzzle-piece filter is named **Subscription Engines**.

For the group picker, open the global default model picker on desktop or a Bot's model picker on phone. Use the Routing Groups filter.

## Driving it with verify-app

### Editor and picker

1. Launch and check an isolated Host. Sign Codex in with a ChatGPT subscription or fixture its installed, signed-in status and `gpt-5.4` model catalog. Leave Claude Code signed out or fixture that status. Seed a Routing Group with `opencode-go/deepseek-v4.1-flash`, Codex `gpt-5.4`, and the Claude Code default in that order through `deepseekbot model-group-create --members-stdin`. Use a configured catalog route and avoid sending messages. This leaves the Codex default available and unsaved.
2. Open each group picker and verify that only the current DSH route is visible under the name. Read the accessible name and check the full ordered list. The expanded DSH routes and the saved members are available from `deepseekbot model-group <id>`.
3. In each editor verify the same member order, the short model title, and the muted Claude Code row with its sign-in reason. Open **Add member** → **Subscription Engines** and compare the choices to `deepseekbot engine status` and `deepseekbot engine models <engine>`. Add the Codex default, move it, remove a different engine, and save. Read back the new member order and revision. Before testing the second editor, restore the original three members using the current revision, or seed a separate group with the same original members.
4. Remove the last DSH model and save. Verify the inline refusal, retained draft, and unchanged stored revision. Add the model back before saving.
5. Capture the editor, group picker, and Add member picker in both themes. Use the paired Expo Web preview for a phone layout comparison. Use the shared device queue for native results.

### Quota fallback

Run the replay first to verify continuation with a completed tool result, deduplication when a reply has already been delivered, and exhaustion without consuming subscription quota. The native-first replay holds the real DSH writer during teardown, checks that neither steer nor engine startup can enter during handoff, then verifies one reply and DSH resume with the recorded engine turn. It also covers explicit `engine use` switches and read-only Workspace Grants in both routing directions.

```sh
pnpm exec vitest run --maxWorkers 2 packages/core/test/routing-group-engine-fallback.test.ts packages/client/test/bridge-turn-stop.test.ts
```

For an isolated Host check, create an engine-first group and assign it through `model-plan-customize <bot> --orchestrator-group <id>`. Send a DM. After an engine limit, check the reset in `deepseekbot engine status` and the switch notice in `deepseekbot channel-timeline <channel>`. The original DM gets one reply in the same Session without another Human message. When every target is resting, open the DM and check the card's earliest reset against `turnStop.rests[0].until`. Use a replay transport when the live subscription cannot produce the intended quota case.

After the first fallback, restart the isolated Host while the engine still rests and send a DM that depends on the earlier conversation. Verify that one reply reaches the Channel and that `bot-sessions` and `session-transcript` reopen the same Session.

## Gotchas

- A task-local engine status fixture can exercise installed, signed-out, and model-list cases without a paid account or a model call. Label the evidence with the fixture and use the regular Host API and editor to verify persistence.
- The CLI accepts engine ID `claude` for Claude Code. The group still needs at least one DSH model after expansion. Explicit `engine use` choices take precedence.
- Before downgrading to a Host that predates engine members, remove them from saved Routing Groups using the current CLI.
