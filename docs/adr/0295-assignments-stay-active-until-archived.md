# ADR-0295: An Assignment stays active until its Orchestrator archives it

- Status: Accepted
- Date: 2026-11-05
- Issue: #3591 (related #3351, #3578; refines ADR-0188)

## Context

ADR-0188 made archiving explicit: `archive_assignment` uses DSH's native Session archive, nothing archives automatically, and `list_assignments` hides archived Assignments by default. That gives the Orchestrator a way to keep finished work out of its directory.

An unsuccessful Turn, however, behaved like a second, implicit end. A native Turn error, a native cancellation, or Host recovery of an Assignment still marked as executing set its activity to `error` and cleared its Continuity Key, and every later Assignment Request was refused with "failed; start a new Assignment instead". The DSH Session and its context still existed; only the Host gate refused it. The same Continuity Key then created a new Session, so iterating on a failed attempt lost its context, and callers could not tell "retry here" from "start over". Requests to an archived Assignment failed with a plain error, not a code a machine caller can act on.

## Decision

An Assignment has two lifecycle states for delivery:

- **Active**: not archived. It accepts Assignment Requests, subject to the existing stop, Grant, acceptance and concurrency checks. Activity (`working`, `idle`, `error`) is an execution fact inside this state, not an end.
- **Resolved**: archived through `archive_assignment`. It leaves the default directory listing. Sending it an Assignment Request through `send_assignment_request` reactivates it: the tool unarchives it through the native Session archive and retries the request once. `unarchived: true` means the archive was undone; it does not mean the request was delivered, because the retry can still be refused by capacity, and only a `steer` or `followup` delivery carries the request. `unarchive_assignment` reactivates it without sending anything. At the Host runtime seam a request to an archived Assignment, or one whose archive is still in flight, stays the coded refusal `{ outcome: 'refused', code: 'assignment-ended' }`, which is what the tool sees before it unarchives and what it returns if the request is still refused afterwards.

An unsuccessful Turn does not resolve:

- `error` keeps the Continuity Key. A request, or `create_assignment` with the same key, continues the same Session. It counts against the Assignment Concurrency Limit like waking an idle Assignment.
- The continuing request carries a Host note that the previous Turn did not finish cleanly, so the Assignment Agent checks workspace state and side effects instead of redoing them blindly.
- A request with `answer_to` to an errored Assignment is still refused. The answer may already sit in the native Inbox after an uncertain acceptance (ADR-0059), so it is never replayed; the Orchestrator inspects and continues with a plain request.
- If delivery fails before native acceptance, the Assignment returns to `error`, not `idle`.

Archiving is therefore a way to file finished work out of the default view, not a lock: an Orchestrator that sends to an archived Assignment means to reuse it (amended the same day after Human review; the first version refused the request).

Nothing resolves automatically. A TTL or turn limit that archives on policy is left to a later change; when it lands it must archive through the same path so the refusal is the same.

## Consequences

- Finished work leaves the default directory only when the Orchestrator archives it, as ADR-0188 already asks; the prompt now says a failed or interrupted Assignment should be continued rather than replaced.
- An Orchestrator stop and a Human stop keep their existing semantics; this ADR does not change `stop_state`.
- Machine dispatch (#3578) can still read `assignment-ended` at the runtime seam and choose to unarchive, as the Bot tool does, or to create a new Assignment.
