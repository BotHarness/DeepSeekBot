# Model Presets

## Sources

- `packages/client/src/client/model-presets-settings.tsx`
- `packages/client/src/client/model-preset-profile.tsx`
- `packages/core/src/models/presets.ts`
- `packages/core/src/models/preset-sub.ts`
- `packages/core/src/features/models/preset-sub-methods.ts`
- `packages/core/src/features/assignments/tools.ts`
- `packages/core/test/preset-sub-assignments.test.ts`
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
- Replace a preset’s API model, Subscription Engine account model, and Routing Group choices and default through the online CLI. An empty list follows main.

## How to get to it (user POV)

In Bot Settings, Model Presets follows Models & execution. The section shows both choices and the number of Bots using each preset. Use Create preset or Edit to set the name, the two choices and the Assignment policy. In a Bot’s model dialog, use Choose preset and Save.

## Driving it with verify-app

Open the section on an isolated Profile. Create two presets and edit one. Apply it to a Bot and reopen Model Presets to check the count. Select Delete and verify that the confirmation names the Bot and says it keeps its applied settings. Confirm and read the Bot’s plan back with `deepseekbot model-plan`.

Check the same list with `deepseekbot model-presets --include-usage`. The online CLI also supports create, update and deletion at a listed revision with `--confirm`. Open Bot Settings as a Member and verify that Model Presets, the Host default and Routing Groups are readable without write controls. Run M15 C4 for the permission gates.


Against an isolated Profile with a legacy route, launch the upgraded Host and run `deepseekbot model-default`. Verify the previous route and effort survived, then create a Bot and read `model-plan` for its inherited preset ID. Open Model Presets and verify Default appears first with no Delete control. Use a model reply and its Turn Target to qualify execution.

On an isolated Host with two usable routes, use `deepseekbot model-preset-sub default`, then pass both choices and a default to `model-preset-sub-set default --expected-revision <revision> --plan-stdin`. Read it back and repeat the stale write to verify `stale-setting`. Repeat for a named preset and apply it to a disposable Bot with an active Workspace Grant. Run `bot-tool <bot-id> list_assignment_models --args-stdin` with `{}` and compare `sub` to the applied plan. Call `create_assignment` without a model, with the second listed choice, and with a third route. Inspect the created sessions’ `modelRoute` values and verify that the third call returns `assignment-choice-not-allowed` with no session. Repeat with a Routing Group as the default. Revoke one role grant and verify listing hides the choice and creation refuses it. Run M15 C separately. The direct tool calls prove Host selection; a real Orchestrator DM and model-generated calls are a separate check.

Create a preset with a named Assignment Subscription Engine. Read its sub list through the CLI and write the same list back. Apply the preset and confirm that `list_assignment_models` names the account and marks the engine as default. Create one Assignment without selecting a model and one with the listed engine, account and model. Verify the recorded Turn Target on both Sessions. Revoke the Bot owner's account grant and verify that the engine is hidden and that both selection paths return `model-not-allowed`. With a quota rest recorded for the account, verify `restingUntil` and `assignment-choice-resting`.

## Gotchas

- The deletion confirmation names Bots whose metadata the Human can read. The usage count includes all Bots with applied copies.
- A startup Patch can seed the legacy native setting before the first upgrade. Set a configured route on the Default preset to change the choice after cutover.
