# ADR-0218: Quick model selection only customizes the Orchestrator

- Status: Accepted
- Date: 2026-10-17
- Issue: [#2000](https://github.com/BotHarness/DeepSeekBot/issues/2000)

## Context

A Bot has one Orchestrator serving its Channels and independent Assignment Sessions. The DM composer is a convenient model entry point, but it cannot infer a particular Assignment as the target. Creating a full Model Plan from a quick choice previously also fixed the Assignment default and allowed set. That silently removed global inheritance.

## Decision

Quick model and reasoning-effort selection changes only the PersonaBot's Orchestrator. The footer and bare `/model` or `/effort` open the same compact picker. Argument commands choose inline. The UI names the Bot-wide scope, next-turn boundary, and separate task-settings entry.

The application-defined Registry remains the only configuration authority. A Model Plan may omit `assignmentDefault` and `assignmentModels` together: Assignments then retain global inheritance. Existing full plans and reusable Model Presets keep their fixed Assignment routes and allowed choices. Presets remain complete templates; applying one copies its values. An Orchestrator customization clears the snapshot's template provenance without modifying the template.

`modelPlanCustomize` can create this narrow plan and uses optimistic revision validation across model-catalog checks. Web, mobile and CLI use the same Host method. Model availability is validated by the current DSH Model Catalog; native Agent-scoped Model Selection applies the selection at the next Orchestrator Turn. No native DSH API or second configuration store is introduced.

A retained Assignment route belongs to its Assignment. An absent retained route means global inheritance, even if a later Bot Plan exists. The adapter and readiness check do not substitute the current Bot Assignment default for that absence. New fixed Assignments still capture the selected route when created. Subagents retain the existing parent-inheritance behavior when no Assignment policy is configured.

## Consequences

- Registry serialization and Profile Backup preserve absence, rather than synthesizing a route.
- The full model editor displays inherited task settings and preserves them on an Orchestrator-only save. Saving as a complete template requires an explicit task model.
- This is an additive persisted state with no table migration, but older versions require a full Assignment route. Before downgrading, explicitly restore full global inheritance or a complete plan for each Orchestrator-only Bot. A code-only revert is insufficient once such plans exist.
- Regression coverage includes restart persistence, stale writes, unchanged fixed choices, inherited Assignment continuation, and the shared CLI/Client path.
