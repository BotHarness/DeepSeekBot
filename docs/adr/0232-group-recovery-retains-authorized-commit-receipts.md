# ADR-0232: Group recovery retains authorized commit receipts

- Status: Proposed; #2056 implementation and runtime qualification in progress
- Date: 2026-10-18
- Issue: [#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)
- Specification: [#2051](https://github.com/BotHarness/DeepSeekBot/issues/2051)

An application-defined held Group draft survives a Host restart, but its old observation
cannot authorize a send. The existing GroupSendReview owner exposes bounded metadata through
`channel_send` with `review_action: inspect`; the owning Bot explicitly reads current Channel
content and supplies `review_action: recover`, the draft ID, a fresh observation and its revised
body. Recovery preserves expiry and the retry count. It does not revive a DSH Tool Promise,
transfer Session ownership, create another Inbox item or automatically publish the old draft.
An explicit Bot/turn stop terminalizes its pending drafts. Graceful Host shutdown preserves
them for explicit recovery; stop and restart are different lifecycle decisions.

The same owning draft record becomes a commit receipt in the canonical Channel append
transaction. The receipt retains the message ID and intent fingerprint; it clears the copied
draft bodies and observation basis. The Channel Source Event remains the content authority.
Inspection returns only metadata, with pending records first, at most 20 records and an explicit
`hasMore` indicator; an exact draft ID can inspect an older record. Existing purge removes the
Channel's derived records. An expired pending draft cannot be revived; an authorized committed
receipt can still confirm an existing message after the pending-draft expiry.

DSH's native Tool call ID protects replay of that same invocation. A fresh model Tool call has
a different ID, so it cannot by itself identify a previous uncertain send. An explicit draft ID
selects its existing receipt; unchanged intent returns the canonical message without appending
another Source Event, placement, action notice or Admission. A different body or owner is refused.
After an uncertain send without a held handle, inspection can discover its committed message ID
and the Bot can read the canonical message before deciding what remains to be done.

Current membership, active Bot, owning Orchestrator Session, source-content fences and attachment
validation apply before recovery or receipt readback. This matters because the existing
`appendMessageOnce` fast path returns an existing message before its fresh-commit callback.
Recovery cannot rely only on that callback for authorization. Direct CLI calls use the existing
separate Bot-scoped diagnostic owner and execute the same Tool code.

Before re-admitting interrupted local Group work at startup, the Host rechecks current
membership. A recoverable Admission with no started side effect is retired as ignored
when access has been revoked. This is a Host policy fact, with a stable refusal reason;
it does not fabricate a Bot observation, Session-authored resolution or completed task.
Uncertain side effects remain `needs-repair`. A new Human DM can then enter its own
authorized turn rather than being steered into the revoked Group turn. The existing
source fence still refuses cross-Channel sends from a revoked running task.

Observation fingerprints also include the attachment owner's current content digest. File identity,
name, MIME type and size alone miss same-size edits such as `10:00` becoming `11:00`. The attachment
owner reads an authorized file descriptor in bounded chunks, rejects files above its size limit,
and refuses a file that changes during that read. Digests stay inside observation evidence; they
do not add copied file content or another public attachment identity. Rechecking file bytes adds
local I/O only for attached messages; it adds no model call. This is a snapshot check, not a lock
on external file writers after the check. Missing or purged files cannot produce fresh evidence.

DSH continues to own Agent lifecycle, Session Persistence and Session Query. There is no new
Session manager, scheduler, database generation or message store. Compared with deleting all
draft state after success, retaining a small receipt costs storage but permits an honest answer
after a lost response. Compared with replaying old draft content automatically, explicit recovery
adds a decision only on the interrupted path and keeps current context authoritative.

The independent #2055 busy-review policy is not introduced by this slice. When combined, recovery
must retain its retry/override bounds and explicit stop semantics, with a separate combined
regression. Mechanical tests and CLI readback do not replace the registered full DSH Session,
whole-episode cost and conversation evaluation.

## Composition with bounded review

[ADR-0231](0231-busy-group-review-has-an-explicit-progress-boundary.md) persists the
required observation's Host identity alongside its process-local read serial. Serials
are compared only within that Host. A fresh observation from a new Host may cover a
changed required message, but must still include every required ID and pass the same
canonical content and attachment digest comparison immediately before commit. Recovery
never resets attempts, version, expiry or the spent-override marker. An exhausted draft
requires the explicit recovery action and its still-available freshness override together.

An override commit writes the same atomic receipt as an ordinary commit. Returning that
receipt after response loss consumes no second override and creates no Source Event,
placement, Admission or action notice. Inspection rejects override arguments: it remains
a metadata-only operation. Combined runtime qualification is separate from either
independently frozen model cohort.
