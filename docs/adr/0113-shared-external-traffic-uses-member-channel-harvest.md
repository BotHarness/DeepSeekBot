# ADR-0113: Shared external traffic uses member Channel harvest

- Status: Accepted
- Date: 2026-10-03

## Context

#700 separates Channel collection from Bot processing, but accepted ordinary external messages previously admitted only the receiving identity. #638 needs independent member attention without duplicating the shared transcript or introducing another queue.

## Decision

For a newly placed ordinary external message, Messaging atomically commits one canonical Source Event and placement plus one Inbox Admission for each current active member. Each admission snapshots the existing Channel wake override or that member's Bot `group-ordinary` default, including revisions and count/time thresholds. Direct external mentions keep the receiving identity's established mention path; they do not mention every local member. Replay retains the original recipients and policies and cannot admit later joiners retroactively.

Placed ordinary admissions use the existing Channel digest, chronological harvest budget, safe turn queue, recovery and per-Bot settlement. They are excluded from the identity-specific external digest runner. Accepted history stays shared; intake pause does not erase already accepted facts. Removed members and paused Bots remain governed by existing Channel/registry lifecycle. Offline remote events are not fabricated or backfilled. For the receiving Bot only, an explicit followed-thread wake override takes precedence; thread route/revision remains a separate threshold partition. Other members retain their own Channel rule.

Group Profile displays each member's actual effective policy and whether it comes from the Bot default or a Channel override, and edits through the existing audited owner. Bridge collection remains separate. Mentions-only ordinary context is bounded and claimed when a later addressed Channel/external turn needs it; silent rows do not wake or implicitly join context. Immediate ordinary traffic queues behind active work and never steers an active step.

A shared Admission grants local visibility and processing, not external-account authority. Identity-specific source reads require the canonical receiving Bot, and checked history/files/replies retain the existing current Grant/account checks. Harvest text identifies sender, platform, external message ID and Source Event, treats external content as untrusted, and requires the Bot's own authorization for external actions.

External harvest and ordinary local Bot replies that follow it do not gain Memory observation or branch-control authority; the runtime skips those Memory operations instead of failing and retrying a successful Channel turn. Addressed Bot messages keep their existing Memory authorization.

No schema, scheduler, credential, provider SDK or shared Inbox store is added. Existing admission revisions and history are not rewritten.

## Consequences

The behavior expands only explicitly collected ordinary traffic placed in a Group Channel. Inbox-only routes keep #613 semantics. Multi-target routes, second-identity external replies and global platform defaults remain separate tickets. New member admissions already persisted by this version should be settled with a forward fix if necessary; a revert does not undo external effects or accepted facts.

References: [#638](https://github.com/BotHarness/BotHarness/issues/638), [#693](https://github.com/BotHarness/BotHarness/issues/693), [ADR-0108](../decisions/im-providers.md#adr-0108), [ADR-0112](../decisions/im-providers.md#adr-0112).
