---
Status: Accepted
Date: 2026-11-01
---

# Messaging owns external readiness and receiving evidence

## Context

Runtime independently interpreted external Grant payloads and Admission policy revisions,
while Messaging evaluated Bridge reception paths. Its path-only query did not cover default
DMs, mentions or grant-backed ordinary digests. Treating every default conversation as a
Bridge would make optional Channel sync control independent default reception. See [#3261](https://github.com/BotHarness/DeepSeekBot/issues/3261).

## Decision

The application-defined Messaging capability owns `inbound.pendingExternal`: ready Sources,
digest partitions and merging grant-backed and Bridge candidates. Runtime owns timers,
backoff, turn scheduling, prompt budgets, final availability checks and settlement. Local
Channel/member harvest remains with Runtime. No new DSH Service or SessionEvent is introduced;
the existing Agent Inbox and Session execution adapter remain the platform seam.

New direct external Admissions record immutable `kind: grant` authority evidence in the
existing `messaging_source_paths` table, in the same transaction as their Source and Admission.
The namespaced storage key is not a Bridge route. New Bridge snapshots say `kind: bridge`;
older untagged Bridge snapshots retain their interpretation. Admission columns remain the
captured policy authority; the evidence adds no second policy snapshot or queue. Existing
Channel-member Admissions retain their Channel placement/member-policy authority.

Default DM/mention creation is preserved. Grant evidence does not authorize Channel history,
placement, management or a new reply route. A default receiver does not depend on a concurrently
configured Bridge. Historical reads, intake eligibility and current reply eligibility remain
different checks. Provider leases, sender permissions, Binding state, Grant revision and the
Runtime's final availability checks still fence execution.

No-path historical records use their saved Source/Admission/revision facts. Reads and redelivery
do not manufacture evidence from today's routes, defaults or `intakeAfter`. Existing snapshots
are never updated. The historical adapter remains necessary for handled records and imported
backups even after all current pending rows drain.

Preserve the two-stage limit: first select up to 20 grant-backed candidates with mention
priority, then merge Bridge candidates in chronological order and take 20 distinct Sources.
Grant-backed timers count pending rows; readiness also sees retryable rows. Bridge timers
retain their own retryable behavior. This change does not harmonize those policies or change
lexicographic versus chronological timer anchors.

A read-only `messaging_bridge_sources` view hides the evidence discriminator from Runtime's Channel harvest. It is derived from the same immutable evidence, not a second queue.

Schema generation 113 adds that view and an authority lookup index, and fences older Bridge-only readers.
It performs no historical backfill. Downgrade requires the pre-upgrade Profile backup;
reverting code alone does not make the upgraded Profile writable by an older Host. Restore
continues to suspend external reception and mark unfinished work for repair; purge remains
irreversible content removal.

## Verification

Fixed old-format fixtures exercise selection, pending/retryable timers, mention context,
read-only history and revocation through the public Messaging boundary. Intake tests exercise
default DM/reply, default mentions with stopped Channel sync, Bridge paths and Runtime harvest.
A generation-112 upgrade fixture preserves Admissions/content and checks the older-reader
refusal. A task-owned Host with a synthetic external Provider qualifies the production runtime
seam separately from real-provider delivery.
