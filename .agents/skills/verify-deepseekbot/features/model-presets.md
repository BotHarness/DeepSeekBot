# Model Presets

## Sources

- `packages/core/src/features/models/plugin.ts`
- `packages/client/src/client/model-presets-settings.tsx`
- `packages/client/src/client/model-preset-profile.tsx`
- `packages/core/src/models/presets.ts`
- `packages/core/src/team/bridge-access.ts`
- `scripts/e2e-team-security.mjs`
- `scripts/team-security-model-configuration-gate.mjs`

## Terms

- Model Preset
- Model Choice
- Routing Group
- Host Permission

## Sub-features

- Browse all Model Presets with their Model Choices and usage counts. The pinned Default appears first and includes inheriting Bots.
- Create and edit presets with `models.configure`. Deleting a user preset preserves applied Bot plans. The Host refuses deletion of Default.
- Apply a preset from the Bot model dialog under the existing Bot and model permissions.

## How to get to it (user POV)

In Bot Settings, Model Presets follows Models & execution. The section shows both choices and the number of Bots using each preset. Use Create preset or Edit to set the name, the two choices and the Assignment policy. In a Bot’s model dialog, use Choose preset and Save.

## Driving it with verify-app

Open the section on an isolated Profile. Create two presets and edit one. Apply it to a Bot and reopen Model Presets to check the count. Select Delete and verify that the confirmation names the Bot and says it keeps its applied settings. Confirm and read the Bot’s plan back with `deepseekbot model-plan`.

Check the same list with `deepseekbot model-presets --include-usage`. The online CLI also supports create, update and deletion at a listed revision with `--confirm`. Open Bot Settings as a Member and verify that Model Presets, the Host default and Routing Groups are readable without write controls. Run M15 C4 for the permission gates.


Against an isolated Profile with a legacy route, launch the upgraded Host and run `deepseekbot model-default`. Verify the previous route and effort survived, then create a Bot and read `model-plan` for its inherited preset ID. Open Model Presets and verify Default appears first with no Delete control. Use a model reply and its Turn Target to qualify execution.

## Gotchas

- The deletion confirmation names Bots whose metadata the Human can read. The usage count includes all Bots with applied copies.
- A startup Patch can seed the legacy native setting before the first upgrade. Set a configured route on the Default preset to change the choice after cutover.
