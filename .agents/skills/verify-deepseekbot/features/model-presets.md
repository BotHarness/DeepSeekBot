# Model Presets

## Sources

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

- Browse all Model Presets with their Model Choices and usage counts.
- Create, edit and delete presets with `models.configure`. Deletion preserves applied Bot plans.
- Apply a preset from the Bot model dialog under the existing Bot and model permissions.

## How to get to it (user POV)

In Bot Settings, Model Presets follows Models & execution. The section shows both choices and the number of Bots using each preset. Use Create preset or Edit to set the name, the two choices and the Assignment policy. In a Bot’s model dialog, use Choose preset and Save.

## Driving it with verify-app

Open the section on an isolated Profile. Create two presets and edit one. Apply it to a Bot and reopen Model Presets to check the count. Select Delete and verify that the confirmation names the Bot and says it keeps its applied settings. Confirm and read the Bot’s plan back with `deepseekbot model-plan`.

Check the same list with `deepseekbot model-presets --include-usage`. The online CLI also supports create, update and deletion at a listed revision with `--confirm`. Open Bot Settings as a Member and verify that Model Presets, the Host default and Routing Groups are readable without write controls. Run M15 C4 for the permission gates.


## Gotchas

- The deletion confirmation names Bots whose metadata the Human can read. The usage count includes all Bots with applied copies.
- The AX default model can be locked by a startup Patch. To verify a successful default write, use a writable Profile with a configured provider.
