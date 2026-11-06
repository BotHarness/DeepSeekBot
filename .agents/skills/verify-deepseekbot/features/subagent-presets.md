# Native Subagent presets

## Sub-features

- Independent child: explicit allowed preset, configured child default, current DSH default.
- Fork: parent composition, no independent preset override.
- Direct CLI: a live Assignment's native tool pipeline via `--session`; coded refusal without one.
- Orchestrator: no Subagent tools; refusal points to `create_assignment`.

## How to get to it (user POV)

Open a Bot DM and ask it to delegate an independent calculation. The Orchestrator creates an Assignment, and the Assignment may start Subagents. The parent reports the child's result through the unified sending tool. The child Session records its selected native preset. Plugin configuration may provide `subagent.agentPreset` and `subagent.allowedAgentPresets`.

## Driving it with verify-app

Launch an isolated Host using `scripts/verify-app.mjs`. Open the Bot DM through `shot`, ask it to delegate a short calculation, and inspect its reply. Use `deepseekbot bot-tool <slug> bot_subagent --session <assignment-session-id> --args-stdin` against the same Host to exercise the native pipeline directly; omit `agent_preset` to test the system default. Inspect the child Session's `agent-preset/selected` event and compare it with the registry default. Choose a different parent preset so inheritance cannot accidentally pass. Test a rejected raw `agent_preset`, a direct call without `--session`, and one with the Orchestrator Session id; both must return `parent-unavailable`. Use `bot-trace --session direct` for CLI outcomes.

## Gotchas

A model route is not an Agent preset. Tool success alone does not establish the child's composition: read the child's canonical selection. A fork inherits its parent. A system-default change applies to the next independent child. No external IM sending is needed for this journey. Stop only the task-owned Host and preserve evidence.

## Native background lifecycle regression

Ask a working Assignment to start bot_subagent with run_in_background true, then let that Assignment become idle before its child completes. Verify the native child completion and new Assignment turn in the Session events, and exactly one visible result reaches the Bot DM through the Orchestrator. A direct CLI call on an idle Assignment must refuse unavailable execution authority; separately exercise the same call during an active authorized Assignment turn. Do not weaken this authority check to create the background fixture.

Separately change the Bot model while its Orchestrator is idle, submit a new Human DM, and inspect the first request/header config and assistant/message source for the new model. This is distinct from Assignment child completion. During a separate long foreground CLI child, submit a new Human DM and exercise stop or steering; only the real Human turn is controlled. Check cancellation, pause/archive, and a report arriving during prior-turn cleanup with deterministic regressions. Reports create no new Source Event and cannot implicitly reuse previous Human authority.

Direct Orchestrator-child graphs predate #2968. Retained graph restoration remains a legacy compatibility regression in native-subagent-runtime.test.ts; native-subagent-wake.test.ts checks event ordering. Neither is evidence that current Orchestrators can create children, nor a substitute for the real Assignment journey above.
