---
Status: Accepted
Date: 2026-11-18
Issues: [#4580](https://github.com/BotHarness/DeepSeekBot/issues/4580)
---

# ADR-0356: An Assignment's Shell follows its Grant's write switch, and Tob's own folder starts writable

## Context

ADR-0238 made a Grant's **Allow Bot to write in this folder** switch govern native file writes for both the Orchestrator and its Assignments, and left ADR-0205's Shell and plugin execution policy independent. A `workspace-write` Assignment on a read-only Grant could therefore not save a file with the native `write` tool, yet could write the same file with `bash`, because its DSH sandbox followed the Assignment's permission snapshot alone. Tob created the Grant for its own files folder read-only, so every Tob Assignment hit this split and fell back to the Shell (#4580). The refusal also read "outside this Session's authorized workspace", which hid the real reason.

## Decision

The Human chose one write switch for every Bot write path in a granted Workspace.

- A `workspace-write` Assignment runs in DSH's `read-only` sandbox while its Grant does not allow Bot writes, and returns to `workspace-write` on its next admission after the Human turns the switch on. Its permission snapshot is unchanged; a write the Shell still needs goes through DSH's own escalation approval. `danger-full-access` stays independent, as in ADR-0238.
- A native write inside a Workspace the Session may read but not write is refused as read-only, not as outside the workspace.
- Tob creates the Grant for its own files folder with writes allowed, as member Bots' account Grants already are. This is a new Grant's initial state, not an upgrade: an existing read-only Grant stays read-only until the Human enables it, as ADR-0238 requires.

This amends ADR-0238's statement that ADR-0205's Shell policy remains independent for Assignments; the Orchestrator's Shell was already confined to writable roots by its execution-root selection.

## Consequences

Assignments on read-only Grants lose the Shell writes they had. Hosts whose Tob Grant was created before this change keep it read-only; the Human enables writes on that Grant once. Revoking a Grant now reports `GRANT_UNAVAILABLE` for a running Assignment before any mode mismatch.
