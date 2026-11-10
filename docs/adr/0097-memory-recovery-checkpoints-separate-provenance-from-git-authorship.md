---
Status: Accepted
Date: 2026-09-30
---

# Memory recovery checkpoints separate observation from Git authorship

## Context

The checked-out Memory Repository is current Memory (ADR-0068). Native Git reset, merge, branch movement, and unfinished working files are valid. A database row containing only the observed HEAD cannot restore staged or unstaged content. The old accepted-commit ledger also labelled the HEAD seen after an Orchestrator turn as Agent-authored, although an external editor could have changed the same repository during that turn. DSH 0.2.0-rc.1's signed browser cookie authenticates access to the Host but supplies no individual Human principal.

## Decision

Memory Service records a recovery checkpoint when it first sees a repository state, sees an external net change, finishes an owned Orchestrator turn, or completes an explicit Human command. Each checkpoint records branch, HEAD, index tree, working tree, time, and a trusted _observation or command context_. Git objects are retained under `refs/botharness/recovery/<checkpoint-id>`; a hidden synthetic commit chain preserves the index and working trees, with the observed HEAD as parent. The real index, working tree, branch, and Git history are unchanged by capture. Ordinary untracked files participate; Git-ignored files remain outside Git checkpoints and stay in the full repository backup made at restore time.

An `agent-session` origin means the Host observed the result after that owned Session and Source Event; it does not prove the Agent authored every byte or commit. A `host-observation` has unknown content origin. A `human-command` names the one Host-owned local Human only for a command the Host actually performs. The signed DSH access boundary admits that command, and BotHarness uses the same `local-human` identity as Channel membership (ADR-0078). Shared Host credentials still represent one local Human; this does not authenticate or distinguish multiple people. Git author fields remain Git facts. Future accepted-commit observations use Host/system attribution instead of claiming Agent authorship; historical rows remain readable but are not proof of file authorship.

The Memory evolution view lists checkpoints separately from the Git graph. A Human selects one, reads its branch, HEAD, observation context, and time, then confirms restore. The Host refuses restore during an active Memory turn or if the current checkpoint changed since selection. It verifies the hidden reference and tree lineage, prepares and checks a separate repository copy, then archives the entire current repository before swapping in the prepared state. The archive preserves ignored files and all pre-restore Git metadata. Restore never runs automatically. The restored state receives a new Human-command checkpoint.

## Consequences

Host turn preparation, settlement, abort cleanup and commit reporting execute their Git subprocesses asynchronously (#3638). The same typed Git-step implementation serves existing synchronous Human commands and asynchronous turn consumers; database reads and transactions stay on the owning Host thread, and a transaction never spans a Git wait. This avoids duplicating observation and checkpoint algorithms while allowing call heartbeats and other Host work to run during Git execution.

A per-Bot operation reservation is acquired before the first asynchronous Git step. Conflicting synchronous Memory queries or commands refuse with `memory-conflict` until that operation finishes; separate Bots do not share a global queue. The active turn remains reserved through abort or settlement cleanup. Preparation and acceptance recheck repository identity and Git facts after waits, and accepted-head compare-and-set remains authoritative. Capture still creates Git refs before recording a database checkpoint, preserves the real index, and reports capture failures without rewriting accepted success. This reservation coordinates Memory Service operations; it does not lock external editors or native Agent Git commands, so unstable repository observations continue to refuse.

BotRuntime treats those waits as part of the active turn. Messages arriving at a Memory boundary remain pending for the next turn instead of attempting to steer an Agent through a conflicting observation. Human Stop also targets a preparing turn before the Agent adapter has created its run: the runtime records the stop against its current Session, waits for cleanup and checks the stop before starting the Agent. Runtime idle and shutdown wait for Memory settlement; an old turn cannot release a later turn's reservation.

The operational database is a query index and audit of observations; Git objects and refs preserve recoverable content. Neither is an admission gate for current Memory. States that were never observed cannot be reconstructed, and a change made and reverted between scans is not inferred. An unresolved merge index cannot be represented as one Git tree; checkpoint capture must report failure rather than silently claim protection. Concurrent edits detected before the swap stop restore. Multi-Human attribution requires a new authenticated principal and authorization design.

We chose hidden Git refs over automatic commits on a visible branch or a second file store because native branch history stays ordinary Git and snapshots do not stage or commit the active worktree. A full copy is made only for an explicit restore, when preserving ignored content and original Git metadata matters more than copy cost.
