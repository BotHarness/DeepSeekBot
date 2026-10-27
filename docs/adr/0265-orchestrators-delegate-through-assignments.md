# ADR-0265: Orchestrators delegate through Assignments

Status: Accepted

Date: 2026-10-27

## Context

An Orchestrator Session could delegate in two ways: `create_assignment`, which starts a visible Assignment Session with its own Workspace Grant, report and continuity key, and `bot_subagent` or `bot_subagent_fork`, which started a DSH Subagent below the Orchestrator itself. The two paths overlapped. The Subagent path skipped the Assignment Directory, the Group Work panel and Workspace Grants, and the Human could not see from the chat which direction ran on which model. Tool schemas also differed between the two root roles, which made the choice harder for the model.

## Decision

Only Assignment Sessions, and the Subagents they start, install `bot_subagent`, `bot_subagent_fork` and `list_bot_subagent_models`. An Orchestrator Session installs a guard instead. It refuses the native `subagent`, `subagent_fork` and `list_subagent_models` tools and the Bot Subagent tools with a pointer to `create_assignment`, and its system prompt says to delegate with `create_assignment`.

Direct CLI calls of the Bot Subagent tools name the parent with `bot-tool --session <assignment-session-id>`. The Session must be one of the Bot's Assignment Sessions with a live Agent; otherwise the call returns `parent-unavailable`. Other Bot tools keep running as the Orchestrator and reject `--session`. This replaces the Orchestrator parent of ADR-0251's direct calls; ADR-0251's preset order is unchanged.

## Consequences

An Orchestrator that needs parallel or isolated work creates Assignments. Work that has no Workspace Grant runs in the Orchestrator itself or waits for a Grant. Existing Subagent Sessions under an Orchestrator stay readable; they cannot start new children. An Assignment keeps the full Subagent surface, so a delegated direction can still fan out on its own models.
