# Orchestrator model switching

## Sub-features

- DM `/model <filter>` and `/effort <filter>` select only this Bot's Orchestrator.
- The footer chip and bare commands open one model dialog, defaulting to “Specific models” with main and task controls immediately visible.
- “Choose preset” shows each preset's name, main model and task model in the same dialog. Selecting a preset stages the complete pair; Save applies it, while Cancel discards it.
- Direct edits can change either model independently; changing the main model preserves the task route and allowed efforts. Inherited Assignment settings remain absent unless explicitly changed.
- Sidebar quick selection and mobile Host client use the same `modelPlanCustomize` method.

## How to get to it (user POV)

Open a Bot DM. Type `/model ` to show available models and scope. Filter, choose with keyboard or mouse, then type `/effort ` to choose a supported effort. Click the footer model chip to edit main and task models directly. Use “Choose preset” to select a complete named configuration, or “Specific models” to return to the staged model controls. Save applies the selection; Cancel leaves both models unchanged.

## Driving it with verify-app

Launch an isolated Host and run doctor. Create one globally inheriting Bot and one Bot with a complete Model Plan. Drive the composer and sidebar entry points, then inspect `botharness/modelPlan`. Check that only `orchestrator`, revision and customization metadata changed; Assignment fields remain either identical or absent. Repeat after a page reload and Host restart. Run `deepseekbot model-plan-customize` against the same Host with a stale expected revision and verify refusal.

Capture the inline menu, direct model dialog and preset list at desktop and narrow widths. Confirm only one dialog is open and that selecting a preset shows both routes without persisting until Save. Verify task-only edits preserve the main route, cancellation makes no writes, and reopening defaults to “Specific models”. Send a real DM after selecting an available route, and check the reply plus actual Session request route. Unit tests separately gate the current-turn and inherited Assignment continuation boundaries.

## Gotchas

- Model Preset is a complete reusable template; Model Plan is this Bot's saved configuration. Do not equate the two.
- No retained Assignment route means global inheritance, not the latest Bot task default.
- Older binaries cannot read Orchestrator-only plans. Restore full inheritance or a complete plan before downgrading.
- A successful catalog/configuration call does not prove a provider request or UI interaction.
