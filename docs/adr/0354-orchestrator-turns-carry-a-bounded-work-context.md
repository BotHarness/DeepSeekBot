---
Status: Accepted
Date: 2026-11-17
Issues: [#4405](https://github.com/BotHarness/DeepSeekBot/issues/4405)
---

# Orchestrator turns carry a bounded work context

> Amends [ADR-0045](../decisions/sessions.md#adr-0045): BotHarness now adds a short, bounded summary of active Workspace Grants and unarchived Assignments to an Orchestrator turn when that summary changed.

ADR-0045 kept the Assignment Directory out of every Orchestrator turn so that context would not grow without bound, and left inventory to `list_assignments` and `list_workspace_grants`. Once the coordination Prompt Part made the Orchestrator delegate all real work (#4405), every dispatch began with those two lookups. A real-model eval measured three to four serial model calls, 12 to 18 seconds, before the first Assignment started, almost all of it model reasoning spent on the lookups.

## Decision

An Orchestrator turn may carry a **Host work context** text part, after the turn's own input. It starts with `[Host context]` and lists the PersonaBot's active Workspace Grants (id, title, path, whether the Orchestrator may write) and at most 12 unarchived Assignments (Session id, title, Continuity Key, DSH-derived activity). The Host emits it only when its text differs from the last one sent to that Orchestrator Session, so an unchanged inventory adds nothing to later turns. It is a Host-authored summary of Directory facts, never an Assignment Report or Lifecycle Notice, and it does not replace the Directory: details, history and search still go through `list_assignments`, `inspect_assignment` and `list_workspace_grants`.

`create_assignment` accepts an omitted `grant_id` when exactly one Workspace Grant is active and uses that Grant; with none or several active it fails and names the Grants. Raw paths remain unaccepted.

## Considered Options

- **Keep inventory on demand only (ADR-0045 as written)** — rejected: it costs two model calls on every dispatch once delegation is the default.
- **Inject the complete Assignment Directory every turn** — still rejected, for ADR-0045's reason: unbounded context growth. The block is capped and change-only.
- **Put the inventory in the system prompt** — rejected: the system prompt is frozen per Session, and the inventory changes during it.

## Consequences

- Dispatch with the delegation prompt starts Assignments in about 8 seconds instead of 12 to 18 in the same eval.
- An Orchestrator with more than 12 unarchived Assignments still needs `list_assignments` to see the rest.
- The summary is kept per Orchestrator Session in Host memory; after a Host restart the first turn carries it again.
