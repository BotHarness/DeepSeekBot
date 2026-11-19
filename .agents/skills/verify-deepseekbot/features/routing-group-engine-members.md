# Subscription Engines in Routing Groups

## Sources

- `packages/core/src/models/{routing-groups,group-fallback}.ts`
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

- The CLI saves a Codex or Claude Code target with an optional engine model in an ordered Routing Group. Listing and showing the group return those members in order.
- Routing Group settings display the engine by name. Desktop and phone model choices show engine names as part of the group's description.
- The phone editor shows saved engine rows as read-only and preserves them in the ordered member list when saving other edits.
- The local Orchestrator runs the first ready target in a mixed group. After quota, the next ready engine or DSH model continues the same request in the same Session, using completed tool results. A reply already sent for the original Source Event is protected against a second send. Assignment and Subagent choices use the group's DSH route projection.
- The Channel shows a limit card when every target rests. The card gives the earliest reset time.

## How to get to it (user POV)

Create a mixed group with `deepseekbot model-group-create --members-stdin` as shown in the [CLI guide](../../../../docs/bot-cli.md#routing-groups). Open Bot settings → Models & execution → Routing Groups. The group row and its member list show the engine name and any configured engine model. Open a model picker and browse the Routing Groups filter to see the same label.

On a paired phone, open a Bot's settings, open its model picker and select the Groups filter. The group row shows its DSH route and saved engine labels.

## Driving it with verify-app

Launch and check an isolated Host. Read `deepseekbot model-catalog` and use a catalog route in the fixture. Create a group with engine, DSH model and another engine in that order. Read it with `model-groups` and `model-group <id>`. Update the engine model with `model-group-update --members-stdin`, then read the group again. Verify `group.members` contains each engine and `routes` contains only DSH routes. Confirm an unknown engine is refused and leaves the revision unchanged.

Use `verify-app shot --bot-mode` to open Routing Group settings and check the group summary and member list. Check the model picker Group row and confirm the active route label still points to the DSH model. Run the phone path through the shared device queue.

On the phone, open Settings → Models and presets → Routing Groups and select the mixed group. Verify that each engine row shows the engine name and optional model. Rename the group and save. Read `deepseekbot model-group <id>` again and verify the new name and the original member order, including both engines.

For quota fallback, first use the replay test so the run uses no subscription quota.

```sh
pnpm exec vitest run --maxWorkers 2 packages/core/test/routing-group-engine-fallback.test.ts packages/client/test/bridge-turn-stop.test.ts
```

For a live follow-up on an isolated local Host, select the group using `model-plan-customize <bot> --orchestrator-group <id>` and send a DM. After an engine limit, check `engine status` for the reset and `channel-timeline <channel>` for the switch notice. Check that the original DM gets one reply in the same Session without another Human message. In the replay that hits quota after a tool call, verify that the next target sees its completed result. In the replay with an earlier reply, verify that only that reply is delivered. With every target resting, open the DM and verify the limit card's earliest reset against `turnStop.rests[0].until`. Exercise this journey using a replay transport if a real engine quota window is unavailable.

## Gotchas

- The CLI accepts engine ID `claude` for Claude Code. The group still needs at least one DSH model after expansion. Explicit `engine use` choices take precedence.
- Before downgrading to a Host that predates engine members, remove them from saved Routing Groups using the current CLI.
