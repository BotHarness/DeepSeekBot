---
Status: Accepted
Date: 2026-10-13
Issues: [#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)
---

# The Orchestrator triages its own Bot Inbox and curates its Assignments

Today a successful Orchestrator turn marks every Inbox Admission it collected as handled, whether or not the Bot acted on it (`bot-runtime.ts:3229-3248`, `#markReportsHandled`). The prompt states it directly: "Finishing a turn without replying means you considered the message; it is handled." When the Assignment Concurrency Limit refuses a create or wake, the triggering item is still handled, and the only record of what was asked for is in the Orchestrator's conversation history, which compaction can remove.

Assignments also only accumulate. `list_assignments` takes no parameters and returns every Assignment the Bot has ever had. Nothing can archive one. As an Orchestrator keeps running, the directory it reasons over grows without limit.

Upstream DSH (0.2.0-rc.2) has no unread or to-do state on Sessions. It has `idle | running` Agents, turn end reasons, and Workspace-level `archiveSession` / `unarchiveSession`, which refuses an active Session unless `stopActivity` is passed and gates model steps of an archived Session. Inbox state is therefore ours to define. Archive should reuse the native one.

## Decision

### Inbox: the model resolves, the Host never infers

An Inbox Admission is in one of three primary states:

- **unread**: no Orchestrator turn has observed it yet.
- **open**: observed, not yet resolved.
- **resolved**: the Orchestrator explicitly resolved it, with outcome `done` or `ignored`.

A snoozed item is open but hidden until it returns.

A turn ending no longer resolves anything. It moves what the turn observed from unread to open. Which events enter the Bot Inbox, and which of them wake the Orchestrator, stays the job of the existing wake and source policies; this decision adds no second rule based on mentions or source kinds. Whatever a successful turn observed is open until the Bot decides, because a turn having run does not mean the matter is settled. Bot Self-Records keep being admitted already resolved (ADR-0154).

The existing attempt state stays the execution fact (pending, running, retryable, needs repair, handled by a successful turn). Resolution is stored beside it on the Inbox Admission: when a turn first observed it, when and by which Orchestrator Session it was resolved, the outcome and the note. Admissions handled before this change are not reopened.

New Orchestrator tools:

- `inbox_list`: lists open items. Filters are source kind, Channel, Assignment, author and time. Items in the same thread or Channel conversation are grouped into one row with a count. Paging uses an opaque cursor.
- `inbox_resolve`: takes either `ids[]` or a filter, plus `outcome` (`done | ignored`) and a short `note` that is kept in the Inbox diary.
  - A filter call first returns a count and a confirmation token. Only a second call with that token resolves the items. This is the "mark all read" path.
  - An id may also name an item of the current turn, which is then resolved before it ever becomes open.
  - `inbox_ignore` stays as the by-message-id shortcut for one Channel message, including one not yet observed; it records the same ignored outcome.
- `inbox_snooze`: takes `ids[]` or a filter, `until` and `note`.
  - The item leaves the open list.
  - At `until` it returns and wakes the Orchestrator. It returns early if a new Source Event arrives in the same Channel conversation or Assignment.
  - Re-snoozing never moves the return time earlier, and a snooze is limited to 30 days.
  - A filter uses the same count-then-confirm flow as `inbox_resolve`.
  - The return wake is not a new Source Event. A Host timer runs one Orchestrator turn anchored on the earliest returning item, listing every item that came back with its note; the items stay open. If that turn fails, the items are snoozed again for five minutes. An item that already came back early returns silently.
  - The Host arms the timer at startup and after every snooze, so a return due while the Host was down fires when it starts.
  - A capacity refusal tells the Orchestrator to keep the triggering item open or snooze it, never to resolve it.

Turn context:

- Each turn's `[Bot Inbox]` block carries new items in full.
- Older open items appear only as a count plus one-line summaries of the first few, with a pointer to `inbox_list`.

Waking:

- Only new Source Events and returning snoozes wake the Orchestrator.
- An item that stays open never re-wakes it by itself.

Host safety net against forgetting:

- An open, unsnoozed item gets a review wake when both hold:
  - it has been open for more than 4 hours;
  - the Orchestrator has had no other wake in that window.
- The review wake carries a digest of such items.
- A second review follows after a further 24 hours.
- After 2 reviews the item is raised in the Human Inbox as possibly dropped by the Bot, and the Host stops waking for it.
- A review wake whose digest is unchanged since the previous one is skipped, so it cannot loop.

### Assignments: the Orchestrator archives explicitly

- `archive_assignment(session_id)` uses DSH's native `archiveSession`.
  - It is refused while the Assignment is working or stopping. The Orchestrator must `stop_assignment` first.
  - Archiving clears the Assignment's continuity key.
  - Nothing is archived automatically.
- `unarchive_assignment(session_id)` restores it.
- `list_assignments` gains `query` (text over purpose, key and latest report), `activity` filters, `include_archived` (default false) and cursor paging. This aligns it with the Assignment Directory definition in CONTEXT.md.
- The default Assignment Concurrency Limit becomes 8. It stays one profile-wide setting that counts only executing Assignments.

### Prompt: a coordinator with an inbox

The Orchestrator prompt gains a short section, placed before the reply-transport contract. Persona, soul and `memory.md` are already injected and are not repeated. The section says:

- You have an inbox of events from different people, Bots, external sources, schedules and your own Assignments.
- Each turn, triage what is new and decide for each item: reply yourself, coordinate or hand off, fold it into an existing Assignment, open a new Assignment, snooze it, or resolve it.
- Not everything needs an Assignment.
- Items belong in the same Assignment when they serve the same goal or deliverable (the same PR, the same feature), regardless of who sent them. Check `list_assignments` before creating one.
- When the concurrency limit refuses a create, the item stays open. Snooze it or leave it, and do not resolve it.
- Resolve what is finished, in bulk when appropriate.

The line equating "finished turn" with "handled" is removed. The inbox is described as a working list, with `inbox_history` remaining the diary of past items.

## Consequences

- Delivery follows the tracer-bullet slices in #1561. The Assignment archive, the Assignment Directory query and the default limit of 8 ship first. The inbox states, tools, review wake and prompt section follow, and each slice updates CONTEXT.md and the living architecture as it lands.

- CONTEXT.md:
  - "Attention Decision" changes from handling following successful turn completion to explicit resolve or snooze.
  - "Bot Inbox" gains open, resolved and snoozed.
  - "Assignment Directory" gains archived.
- The Human-facing Bot Inbox view shows unread, open and snoozed instead of the current derived pending and handled states.
- Existing handled admissions migrate to resolved (`done`).
- Prompt length grows slightly, and per-turn context shrinks for Bots with many old open items.

## Rejected

- **Turn-end auto-handling with Host-side exceptions for capacity refusals.** The model, not code, decides whether something is done.
- **Every open item re-wakes the Orchestrator.** This loops. The bounded review wake covers forgetting instead.
- **The Bot creates its own Bot Schedule to remember an item.** The reminder must live on the item, or the Bot has to remember to remember.
- **Automatic archiving on stop or completion.**
- **A per-Bot concurrency limit.**
