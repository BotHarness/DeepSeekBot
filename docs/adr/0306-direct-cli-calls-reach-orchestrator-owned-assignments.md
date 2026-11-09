# ADR-0306: Direct CLI calls create and continue Orchestrator-owned Assignments

- Status: Accepted
- Date: 2026-11-09
- Issue: #3351 (supersedes ADR-0297; the #3578 proposal is closed as not planned)

## Context

Only an Orchestrator Turn could start an Assignment. `TURN_ONLY_BOT_TOOLS` kept `create_assignment`, `send_assignment_request` and `wait_for_assignment` out of the direct `deepseekbot bot-tool` runner, while `stop_assignment` stayed direct. Scripts and plugins could stop an Assignment but not start or continue one.

ADR-0297 proposed a separate machine dispatch capability: a `principal=system` caller, `intentKey` and `deliveryKey` namespaces, a durable delivery record with a deduplication window, per-delivery processing facts and a `maxPending` slot. Human review rejected it. That design is a general task queue, which the glossary rules out for Assignments and for the Assignment Delivery Intent, and an Assignment with no Orchestrator behind it has nobody to report to.

## Decision

The direct runner calls `create_assignment` and `send_assignment_request` as the Orchestrator does. The Assignment is owned and managed by that Bot's Orchestrator; there is no system-owned Assignment and no separate delivery surface.

- **Origin.** Without `--source`, each direct call records a `system-message` Source Event carrying `directBotTool.tool` and the Bot. It is the Assignment's origin and audit anchor. It has no Inbox Admission and wakes nobody.
- **Orchestrator notice.** A created, reused or delivered call adds an `assignment-lifecycle` notice to the Orchestrator's Inbox with a `silent` admission. It names the Title, Description and instructions, or the request text. The Orchestrator reads it in its next Turn; later reports arrive as usual. Unlike other lifecycle notices, it is not consumed when `wait_for_assignment` returns, and it stays listed when later reports for the same Assignment are coalesced, so a busy Orchestrator still sees it.
- **Same rules.** Capacity, Workspace Grant checks, Continuity Key reuse, recovery after a failed Turn and reactivation of an archived Assignment (ADR-0295) apply unchanged.
- **Retries.** No new keys. A create with the same Continuity Key never opens a second Session, but it is not idempotent: while the Assignment works it returns `key-busy`, and once it is idle it delivers the instructions again and returns `reused`, which can repeat work. An uncertain create or request is not replayed blindly (ADR-0059); the caller reads `assignment` or `assignment-timeline` first.
- **Authority.** The caller is the authenticated owner of the existing `bot-tool` path, acting for the Human.
- **Still turn-only.** `wait_for_assignment` blocks a Turn and stays turn-only; callers use `assignment`, `assignment-timeline` or `inspect_assignment`.

Getting external events into a Bot Inbox is a separate concern for a general webhook endpoint.

## Consequences

An Orchestrator can receive reports from work it did not start; the silent notice gives it that context without waking it. A failed direct create still leaves its origin Source Event as an audit record of the attempt.
