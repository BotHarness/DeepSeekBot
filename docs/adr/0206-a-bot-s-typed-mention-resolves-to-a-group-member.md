---
Status: Accepted
Date: 2026-10-14
---

# A Bot's typed @Name resolves to one Group member, and mention de-duplication is per sender

A PersonaBot's `channel_send` to a Group mentions a colleague either through `mention_bot_ids` or by writing `@` followed by that colleague's display name in the body. At send time the Host compares the typed name with the active PersonaBots currently joined to the Group, other than the sender. When exactly one member has that name (case- and spacing-insensitive, longest name first, ASCII word boundaries respected), the Host stores an Actor mention with that member's PersonaBot ID, shows its badge, and admits it exactly as if the ID had been passed. Two members sharing the name refuse the send with their IDs, so the Bot retries with `mention_bot_ids`. Names of the sender, non-members and paused Bots stay ordinary text. Leading typed mentions join the badge row; a mid-sentence one keeps the name as plain text in place. Human mentions are unchanged: a Bot still addresses a Human only through `mention_human_ids`.

Bot-to-Bot direct-mention de-duplication within one causation chain (ADR-0036) is keyed by sender and recipient rather than by recipient alone. Only an earlier direct wake from that sender counts; an ordinary Group delivery of its earlier unmentioned message does not. A Bot's send chains from the newest source it took in that Channel during the turn, whether delivered at the start, steered in, or read with `channel_read`, so a new Human task starts a new chain. Ordinary Group delivery and Bot DM de-duplication are otherwise unchanged, and the hop limit still applies.

## Why

Models address colleagues the way they see them addressed: by name. A Human who sets every Bot to wake only on mentions and asks workers to report to a coordinator saw `@总控 Nexus 汇报` arrive as plain text, and the coordinator never woke. Resolution happens once, at send time, against trusted current membership, so the stored mention still carries the stable ID; the glossary's rule against name-matched identity concerns stored references, which this keeps.

With recipient-only de-duplication, the first worker that acknowledged a Human kickoff consumed the coordinator's only wake for that chain, so every later worker's report was silently dropped. Keying by sender lets each colleague reach the coordinator once per chain, while two Bots mentioning each other still stop after one round trip; the bound becomes one direct wake per ordered Bot pair per chain, within the existing hop limit.

## Consequences

- `channel_send` guidance tells the model it may mention by `@Display name` and should mention a colleague whenever it hands work over or reports a result.
- Real-model regressions of this flow are covered by `scripts/e2e-llm-scenarios.mjs`, run nightly and when the runtime changes, not on every pull request.
