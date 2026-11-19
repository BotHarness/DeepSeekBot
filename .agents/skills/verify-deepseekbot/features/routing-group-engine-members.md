# Subscription Engines in Routing Groups

## Sources

- `packages/core/src/models/{routing-groups,group-fallback}.ts`
- `packages/client/src/client/routing-group-settings.tsx`
- `packages/client/src/client/model-menu.tsx`
- `apps/mobile/src/ui/chat/model-settings-screen.tsx`

## Terms

- Routing Group
- Subscription Engine

## Sub-features

- The CLI saves a Codex or Claude Code target with an optional engine model in an ordered Routing Group. Listing and showing the group return those members in order.
- Routing Group settings display the engine by name. Desktop and phone model choices show engine names as part of the group's description.
- DSH model selection continues to use the group's expanded DSH routes.

## How to get to it (user POV)

Create a mixed group with `deepseekbot model-group-create --members-stdin` as shown in the [CLI guide](../../../../docs/bot-cli.md#routing-groups). Open Bot settings → Models & execution → Routing Groups. The group row and its member list show the engine name and any configured engine model. Open a model picker and browse the Routing Groups filter to see the same label.

On a paired phone, open a Bot's settings, open its model picker and select the Groups filter. The group row shows its DSH route and saved engine labels.

## Driving it with verify-app

Launch and check an isolated Host. Read `deepseekbot model-catalog` and use a catalog route in the fixture. Create a group with engine, DSH model and another engine in that order. Read it with `model-groups` and `model-group <id>`. Update the engine model with `model-group-update --members-stdin`, then read the group again. Verify `group.members` contains each engine and `routes` contains only DSH routes. Confirm an unknown engine is refused and leaves the revision unchanged.

Use `verify-app shot --bot-mode` to open Routing Group settings and check the group summary and member list. Check the model picker Group row and confirm the active route label still points to the DSH model. Run the phone path through the shared device queue.

## Gotchas

- The CLI accepts engine ID `claude` for Claude Code. The group still needs at least one DSH model after expansion. `group-fallback.ts`'s `pick` takes the store's DSH-only route projection until [#4574](https://github.com/BotHarness/DeepSeekBot/issues/4574) step 2 adds engine fallback.
- Before downgrading to a Host that predates engine members, remove them from saved Routing Groups using the current CLI.
