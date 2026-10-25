# ADR-0252: Native Subagent reports enter the owning Bot Runtime

Status: Accepted

Date: 2026-10-25

## Context

DSH owns adjacent-Agent messaging and can wake an idle parent after an application-defined Bot turn has finished. The parent Agent remains live, but its turn-scoped Bot tools no longer have an execution context. A direct CLI Subagent call also must not obscure a later Human turn's stop or steering controls.

## Decision

Keep direct tool calls explicitly marked as direct execution in the adapter; stop and steering select only real Orchestrator runs.

Observe DSH's claimed Inbox metadata for `agent-message` and `subagent-settled`, then enter the owning Bot Runtime before native prompt assembly snapshots model selection. Only a current, available Orchestrator and its own direct child can open this path. The existing per-Bot queue and actual adapter readiness coordinate competing Human input, cleanup and cancellation. Native Session messages remain the execution history; this adapter does not copy the report into a new Source Event or replay its text.

A report-only turn has no ambient Human Source Event or Channel. It creates fresh Bot services with no current Inbox responsibility. Outward replies must explicitly reference a trusted source; proactive sends must name an authorized target. Group/Bot causation still requires a real source, and operations requiring a Human origin cannot borrow one from an earlier turn. Existing permission checks run before model execution. DSH continues to own child activation and delivery.

## Consequences

Background results can reach the unified sending tool after the parent becomes idle, and current model selection applies to the first resumed request. Actual adapter readiness ends synchronously with its tool context, even if Runtime cleanup is still pending. A canceled, paused, archived or unavailable parent cannot acquire a new report turn. No persistence migration, automatic final extraction, retry identity or restart-recovery mechanism is introduced; those remaining #2435 items are separate.
