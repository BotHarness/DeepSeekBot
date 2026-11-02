---
Status: Accepted
Date: 2026-10-26
---

# Bot messages wake colleagues on every round; a runaway-only hop limit bounds the chain

A direct Bot-to-Bot Group mention and a Bot DM now admit their recipient on every send that stays within the trusted hop limit (`MAX_BOT_HOPS`, now 32). Ordinary (unmentioned) Group delivery follows each member's Channel wake policy on every Bot message too: an `all` member wakes each time, `digest`, `mentions` and `silent` keep their own rules. The per-chain de-duplication of ADR-0036, keyed by sender and recipient since ADR-0206, no longer applies to any of them. The hop limit is a guard against a runaway loop, not the budget of a normal task; whether a Bot speaks or stays quiet is left to the Bot. The Host adds no built-in rule about when to speak or stop in a Group; a Human shapes that through the Bot's Soul and Memory. When a committed message does not wake a colleague it addressed, because the hop limit was passed or the colleague could not be admitted, `bot_send_message` returns `notWoken` with each colleague's ID and reason, and the Orchestrator guidance tells the Bot to tell the Humans where the work stands.

This supersedes the "two Bots mentioning each other stop after one round trip" bound in ADR-0206; its typed-mention resolution is unchanged.

## Why

#2872: a reviewer Bot that sends work back to a colleague is an ordinary workflow, not a loop. Within one Human kickoff the reviewer's second `@` to the same colleague matched an earlier direct wake from the same sender, so it was committed with a badge and never woke anyone. Neither side was told, and the task stopped half done until a Human restated it. The hop limit already bounds an accidental mention loop deterministically, so a second, tighter rule only removed legitimate rounds.

A real-model department task (a lead, two makers and a reviewer in an all-messages Group) showed the same for ordinary delivery and for the old limit of eight: with the per-root wake cap the makers stalled after their first deliverable, and at eight hops the reviewer could not be woken for the final read-through, so the lead had to fall back to the Humans. A department that pushes work to the end needs a few dozen hops; 32 leaves that room while still stopping a loop long before it costs much.

## Consequences

- A three-round review between two Bots (about seven hops) completes without a Human. A longer chain stops at the hop limit, and the sender learns it from `notWoken` instead of waiting silently.
- Two Bots that thank each other can spend up to the hop limit before stopping; each Bot's Soul and Memory decide how chatty it is, and the `department-task` scenario measures whether a finished task goes quiet.
- In an all-messages Group every Bot message wakes every other member, so each Bot decides for itself whether to reply; the cost of a quiet turn is one short model call.
- `scripts/e2e-llm-scenarios.mjs` gains `review-rounds` (three real-model review rounds) `long-task-reports` (receipt, progress and result of a multi-phase task) and `department-task` (four Bots in an all-messages Group start, collaborate to a final plan and stop).
- External IM follows the same rule. A dsh-im Lark or Discord event may carry `actor.kind: 'bot'`, but only for a Group message that mentions the receiving account. Such a mention wakes the Bot like a Human mention, and the Bot is told the sender is a Bot. These events carry no trusted causation, so a separate guard applies: after `MAX_BOT_HOPS / 2` Bot-sent messages in a row within an hour in one external conversation, later Bot mentions are kept as context and do not wake the Bot. The run ends when a Human speaks in that conversation.
