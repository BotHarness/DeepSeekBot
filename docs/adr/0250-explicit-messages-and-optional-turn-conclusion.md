---
Status: Accepted
Date: 2026-10-25
Issues: [#2435](https://github.com/BotHarness/DeepSeekBot/issues/2435)
---

# Explicit messages and optional turn conclusion

## Decision

An application-defined `bot_send_message` Tool is the outward text/attachment entry point.
The model decides whether a message helps: useful progress, necessary questions and results,
without mandatory acknowledgment or a fixed reporting cadence. Ordinary assistant output stays
private. No final-output JSON envelope or automatic final-text extraction performs delivery.

Reply addressing comes from a trusted, owned Source Event. Proactive addressing names an
authorized target. The existing Channel/Outbox owner rechecks authority and owns delivery facts;
the Tool does not introduce a second message ledger or route registry. Reactions, source sharing
and internal Agent reporting keep their separate semantics.

A message may explicitly select completed Inbox obligations. Delivery precedes resolution.
A committed message with failed resolution returns its receipt and the failed cleanup facts;
it is never resent merely to repair Inbox state. `end_turn` defaults to false. Only successful
delivery and successful requested cleanup may invoke native DSH `concludeTurn()`. A question
can conclude a turn while leaving the task open. Later input remains independently admitted.

## First tracer bullet

The first implementation covers local Human DM text and at most the exact referenced source
for optional resolution. It validates actual Channel placement, own Inbox admission, membership
and purge fences. The existing Channel append-once transaction deduplicates replay of the same
native Tool call identity and rejects changed content. Output provenance names the chosen reply
source, including when it differs from the event that started the turn.

The existing `bot-tool` CLI dispatches the same Tool without a model; there is no active native
turn to conclude on that path. Each separate CLI invocation is a new operation. This slice does
not promise a durable retry command across distinct Tool calls, persisted cleanup intent, or
external unknown-outcome reconciliation. These remain required follow-up slices in #2435.
The second slice extends the same Tool to Group/Bot DM, imported attachments and external IM.
Trusted source classification selects the existing Channel or Outbox owner. Group drafts retain
freshness review, recovery and membership fences. External replies accept an independent message
key; legacy callers without one retain their prior identity. Canonical Outbox payload checks
reject reuse with changed content. Only accepted delivery with a receipt permits optional Inbox
resolution and turn conclusion. No `final_reply_json` field is added.

External file replies currently accept one imported file and empty text; unsupported combinations
are refused before sending. Reaction, draft-inspection/drop and source-sharing actions remain
separate. The model catalog exposes only `bot_send_message` for text/attachment delivery and
`channel_action` for reactions and draft inspection/drop. Legacy send registrations and direct CLI aliases are removed. `channel_action` calls the
existing Channel owner directly, without delegating to an old sending Tool. Durable cross-call retry and stored cleanup
intentions still require the next slice.

Approval explanations follow the same model-chosen policy. The Host does not reject a first
approval request merely because no preliminary message was sent. The existing approval owner,
Human decisions and originating Channel routing remain authoritative.

## Consequences

The model can avoid a redundant final inference by concluding after a successful send. This
is a native turn-control optimization, not an assertion that long-running work has finished.
The interface stays small and the existing owners retain persistence and authorization.
Live qualification must check direct CLI delivery, visible DM output, Inbox state and a later
Human turn on the pinned DSH version. Expansion follows Human feedback on this first slice.
