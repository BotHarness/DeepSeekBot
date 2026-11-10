---
Status: Accepted
Date: 2026-09-29
---

# Memory changes enter Bot Inbox with durable observations

## Context

The checked-out Git working tree is current Memory (ADR-0068). A Human can edit it with an external tool while the Host is running or stopped. The Orchestrator must know that its Memory changed, including after a Host restart, without preloading file bodies or rewriting the Session's fixed system-prompt prefix. A process-only comparison loses the fact that files changed while the Host was stopped.

## Decision

Memory Service observes each PersonaBot repository at Host startup, immediately before an Orchestrator turn, and before local DM or Group mention input steers an active turn. It compares the current branch, HEAD, and bounded per-path working/index content fingerprints with a per-Bot checkpoint in the operational database. The first observation establishes a silent baseline. Later net changes create one application-defined `memory-change` Source Event and Bot Inbox Admission, and advance the checkpoint in the same database transaction. A failed transaction leaves the prior checkpoint in place for retry. An already-admitted event remains pending across restarts without being duplicated by an unchanged scan.

The Event contains a bounded path and status summary, not file contents or an attribution guess. Startup scanning adds pending Inbox facts but does not wake an Agent. The next ordinary Orchestrator turn gathers pending Memory Admissions after its pre-turn scan and presents them in the same Inbox context as other work. The Agent can inspect current files and Git history with native tools. A successful turn marks the Admission handled; interrupted turns follow the existing Inbox retry and repair rules. When local input steers an active turn, its Memory scan admits the net delta and delivers the pending bounded summaries with that input at the next safe step. ([ADR-0318](0318-steering-scans-memory-off-the-host-thread.md) now steers the input first and delivers a change found by the scan in a separate steer.) Only successful steering marks those Admissions observed; refused steering leaves them pending for the next ordinary turn. The active turn settles those Admissions using the same success and retry rules. This prevents its completion baseline from swallowing an edit observed when new input arrived. The scan does not attribute mid-turn edits to a Human or Bot. Changes remaining at a completed turn refresh the observation without a second notification.

The observation is a net-state comparison. A change made and reverted while the Host was stopped leaves no detectable delta. The Event says that Memory changed; it does not claim which actor changed it. `PERSONA.md` changes may be mentioned, while the Session's frozen persona snapshot remains unchanged.

## Consequences

This revises ADR-0060's rejection of all Memory-update notices: its append-only prompt-prefix and frozen-persona decisions remain, while a durable Bot Inbox Event carries external changes at the end of conversation context. There is no independent Memory wake path, Memory file copy, or file body injection. The operational checkpoint is delivery bookkeeping; Git remains the authority for Memory content and history.
