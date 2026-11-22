# Orchestrator model switching

## Sources

- `packages/core/src/features/models/plugin.ts`
- `packages/client/src/client/{model-plan-store,model-preset-profile}.{ts,tsx}`
- `packages/client/src/client/{assignment-model-policy,engine-choice,model-menu,model-picker}.tsx`
- `packages/client/src/client/{bot-sidebar-channel-actions,dm-composer-context,onboarding-view}.tsx`
- `packages/core/src/messaging/im-commands.ts`
- `packages/host-client/src/bot-settings.ts`
- `apps/mobile/app/settings/model-preset.tsx`

## Terms

- Orchestrator Session
- Model Preset
- PersonaBot Model Plan

## Sub-features

- DM `/model <filter>` and `/effort <filter>` select only this Bot's Orchestrator.
- The Messages header chip opens the shared picker for the main model. Model settings in the picker, the DM row's Model action and the bare commands open the model dialog with main and task controls.
- “Choose preset” shows each preset's name, main model and task model in the same dialog. Selecting a preset stages the complete pair; Save applies it, while Cancel discards it.
- Direct edits can change either model independently; changing the main model preserves the task route and allowed efforts. Inherited Assignment settings remain absent unless explicitly changed.
- Header quick selection and the mobile Host client use the same `modelPlanCustomize` method for API routes and Routing Groups.

- On a local origin Host, Main model and Task model have subscription filters. Selecting a subscription model stages that role and its effort. A preset can save and restore either engine choice.
- An installed, signed-out engine offers the engine's official sign-in. Cloud and VPS Hosts omit the subscription filters.

## How to get to it (user POV)

Open a Bot DM. Type `/model ` to show available models and scope. Filter, choose with keyboard or mouse, then type `/effort ` to choose a supported effort. Click the footer model chip to edit main and task models directly. Use “Choose preset” to select a complete named configuration, or “Specific models” to return to the staged model controls. Save applies the selection; Cancel leaves both models unchanged.

## Driving it with verify-app

Launch an isolated Host and run doctor. Create one globally inheriting Bot and one Bot with a complete Model Plan. Drive the composer and sidebar entry points, then inspect `botharness/modelPlan`. Check that only `orchestrator`, revision and customization metadata changed; Assignment fields remain either identical or absent. Repeat after a page reload and Host restart. Run `deepseekbot model-plan-customize` against the same Host with a stale expected revision and verify refusal.

Capture the inline menu, direct model dialog and preset list at desktop and narrow widths. Confirm only one dialog is open and that selecting a preset shows both routes without persisting until Save. Verify task-only edits preserve the main route, cancellation makes no writes, and reopening defaults to “Specific models”. Send a real DM after selecting an available route, and check the reply plus actual Session request route. Unit tests separately gate the current-turn and inherited Assignment continuation boundaries.

For the subscription path, launch with two signed-in accounts on the same engine and configure the Bot to use one account. Open the Messages header picker, choose the other account and check `deepseekbot engine status` for its ID, model and effort. Select an API model and check both `engine status` and `model-plan` for the switch. In Model settings, change the Task model and apply a preset that stores both choices. In Models & execution, open the Default model dialog with a catalog containing one API provider, then search and choose a model from that provider's filter. Launch with `DEEPSEEKBOT_HOST_KIND=vps` and check the available filters.

## Gotchas

- Model Preset is a complete reusable template; Model Plan is this Bot's saved configuration. Do not equate the two.
- No retained Assignment route means global inheritance, not the latest Bot task default.
- Older binaries cannot read Orchestrator-only plans. Restore full inheritance or a complete plan before downgrading.
- A successful catalog/configuration call does not prove a provider request or UI interaction.
