# ADR-0251: Independent Subagent preset selection

Status: Accepted; the direct-call parent is replaced by ADR-0265

Date: 2026-10-25

## Context

Native DSH Agent presets select tools and persona. A PersonaBot Model Plan selects allowed LLM routes. These are separate controls. Inheriting the parent's preset for every independent child unintentionally copies a Bot-specific composition even when the Host has selected a different default.

## Decision

The application-defined `bot_subagent` tool resolves a native preset in this order: an explicit `agent_preset` in `subagent.allowedAgentPresets`, the configured `subagent.agentPreset`, then the DSH registry's current `defaultId`. Read the system default for each invocation rather than capturing it at installation. `bot_subagent_fork` rejects independent selection and retains native parent inheritance.

The existing Subagent tool owner validates configured choices and delegates activation to DSH. Missing services, unknown presets and forbidden explicit selections fail without widening permissions. Model Plan validation remains independent. No additional preset registry or persistence is introduced.

Direct CLI calls use the existing Orchestrator Agent's native tool execution pipeline, preserving its visibility, guards, approval and delegation depth. They never create or resume a parent as a side effect. When no live parent exists, return `parent-unavailable`.

## Consequences

Independent children may now have a different tool/persona composition from their parent. Configure a child default explicitly when that inheritance was intended. Fork behavior and Model Plan route constraints do not change. The CLI uses the same registered tools as the model; the catalog is descriptive and does not grant access.

This preserves the independently scoped contribution from PRs #2419 and #2436 without restoring automatic assistant-final delivery. Issue #2435's per-message recovery work remains separate.
