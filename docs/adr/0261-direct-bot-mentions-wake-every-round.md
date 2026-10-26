---
Status: Accepted
Date: 2026-10-26
---

# Direct Bot mentions and Bot DMs wake on every round; the hop limit bounds the chain

A direct Bot-to-Bot Group mention and a Bot DM now admit their recipient on every send that stays within the trusted hop limit (`MAX_BOT_HOPS`, eight). The per-chain de-duplication of ADR-0036, keyed by sender and recipient since ADR-0206, no longer applies to them. Ordinary (unmentioned) Group delivery keeps its de-duplication per causal root. When a committed message does not wake a colleague it addressed, because the hop limit was passed or the colleague could not be admitted, `bot_send_message` returns `notWoken` with each colleague's ID and reason, and the Orchestrator guidance tells the Bot to tell the Humans where the work stands.

This supersedes the "two Bots mentioning each other stop after one round trip" bound in ADR-0206; its typed-mention resolution is unchanged.

## Why

#2872: a reviewer Bot that sends work back to a colleague is an ordinary workflow, not a loop. Within one Human kickoff the reviewer's second `@` to the same colleague matched an earlier direct wake from the same sender, so it was committed with a badge and never woke anyone. Neither side was told, and the task stopped half done until a Human restated it. The hop limit already bounds an accidental mention loop deterministically, so a second, tighter rule only removed legitimate rounds.

## Consequences

- A three-round review between two Bots (about seven hops) completes without a Human. A longer chain stops at the hop limit, and the sender learns it from `notWoken` instead of waiting silently.
- Two Bots that thank each other with mentions can spend up to the hop limit before stopping; persona and Orchestrator guidance keep acknowledgment-only mentions out.
- `scripts/e2e-llm-scenarios.mjs` gains `review-rounds` (three real-model review rounds) and `long-task-reports` (receipt, progress and result of a multi-phase task).
