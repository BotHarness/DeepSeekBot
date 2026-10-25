# Native Subagent presets

## Sub-features

- Independent child: explicit allowed preset, configured child default, current DSH default.
- Fork: parent composition, no independent preset override.
- Direct CLI: existing live Orchestrator's native tool pipeline; coded refusal without a parent.

## How to get to it (user POV)

Open a Bot DM and ask it to delegate an independent calculation. The parent reports the child's result through the unified sending tool. The child Session records its selected native preset. Plugin configuration may provide `subagent.agentPreset` and `subagent.allowedAgentPresets`.

## Driving it with verify-app

Launch an isolated Host using `scripts/verify-app.mjs`. Open the Bot DM through `shot`, ask it to delegate a short calculation, and inspect its reply. Use `deepseekbot bot-tool <slug> bot_subagent --args-stdin` against the same Host to exercise the native pipeline directly; omit `agent_preset` to test the system default. Inspect the child Session's `agent-preset/selected` event and compare it with the registry default. Choose a different parent preset so inheritance cannot accidentally pass. Test a rejected raw `agent_preset` and a direct call before the parent exists. Use `bot-trace --session direct` for CLI outcomes.

## Gotchas

A model route is not an Agent preset. Tool success alone does not establish the child's composition: read the child's canonical selection. A fork inherits its parent. A system-default change applies to the next independent child. No external IM sending is needed for this journey. Stop only the task-owned Host and preserve evidence.

## Native background lifecycle regression

After a real Bot DM reply, let the parent become idle. Start bot_subagent through the direct CLI with run_in_background true; tell the child to report a unique result and the intended authorized DM destination to its parent. Verify a new native parent turn calls bot_send_message and exactly one visible result reaches that DM. Change the Bot model while idle and verify the first resumed request uses the new selection. During a separate long foreground CLI child, submit a new Human DM and exercise stop or steering; only the real Human turn is controlled. Check cancellation, pause/archive, and a report arriving during prior-turn cleanup with deterministic regressions. Reports create no new Source Event and cannot implicitly reuse previous Human authority.
