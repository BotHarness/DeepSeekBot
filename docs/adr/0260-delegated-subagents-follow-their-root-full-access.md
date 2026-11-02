---
Status: Accepted
Date: 2026-10-26
Issues: [#2870](https://github.com/BotHarness/DeepSeekBot/issues/2870)
---

# Delegated Subagents follow their root Session's full access

ADR-0193 unconfined the Orchestrator under full access but kept Orchestrator Subagents in `workspace-write`. A Subagent's working directory is the Bot's Memory, so a Bot that handed work to `subagent` or `subagent_fork` saw every write outside Memory refused, and its changes ended up inside Memory instead. Nothing said why. Users reported that full access "goes back to the workspace after a while". Assignment Subagents had the same gap in a smaller form: their DSH mode followed the Assignment's dangerous snapshot, but path-checked native file tools still held them to the Grant.

Confining the child protected nothing. Its parent already runs with full access and no approval cards, and can do the same work itself.

## Decision

A delegated Subagent has full access exactly when its root Session does: the Orchestrator while the PersonaBot's preset is `danger-full-access` with the chat scope, or an Assignment whose permission snapshot is `danger-full-access`.

- Before each step, the Host sets an Orchestrator Subagent to the Orchestrator's current mode (`danger-full-access` or `workspace-write`) with approval `never`. Turning full access off narrows it again at its next step.
- Full-access checks (native file tool paths, device authorization, `bot_create`, approval cards) look at the root Session, so a Subagent under a full-access root is treated like its root.
- Approval stays native `never` for every delegated Subagent, as ADR-0205 and ADR-0239 set. It cannot ask the Human, and under full access it has nothing to ask for.

This amends ADR-0193's "Orchestrator Subagents stay confined". Its other decisions stand, and existing Assignments still keep the mode they were created with.

## What this gives up

A Subagent of a full-access Orchestrator can now change files anywhere without approval, as its parent can. The warning on the full access switch already covers the chat Session and everything it starts.
