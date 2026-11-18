# ADR-0115: Explicit Inbox sharing adds a canonical Channel placement

- Status: Accepted
- Date: 2026-10-03

## Context

An external source can reach a PersonaBot Inbox without occupying its Human DM. Team collaboration sometimes requires that Bot to share one accepted fact in an existing Group Channel without converting future intake into a Channel Bridge or duplicating the message as a Bot-authored quote.

## Decision

The application-defined Messaging owner exposes `bridge_share(source_event_id, channel_id)` through the active Orchestrator's scoped Tool Consumer. The caller supplies references only. Execution validates its own Inbox admission, active receiving Bot, current identity/account/Grant and joined Group membership before committing any disclosure.

Sharing inserts the existing canonical Source Event's first Channel placement and snapshots current active members' existing ordinary attention rules in the same operational transaction. The receiving Bot's existing admission is retained, including its policy and attempt lifecycle. Recording the share as a side effect does not create a second owner attention. Publication and wake recovery occur after commit, using existing Channel publication and count/time harvest; no new scheduler or shared Inbox store is introduced.

Inbox origin and receiving identity remain unchanged. The source's local placement is visible to current Channel members with original sender, time, platform and external IDs. Member admission permits local read and discussion only. Checked external reads, history, files and replies still require the Bot's own current authority; sharing never borrows the receiving identity or sends externally.

The initial tracer supports one Group placement for an Inbox-only source. Retrying that destination returns the committed result, including after restart, without admitting later joiners. Another destination, an already Channel-targeted source or a DM destination is refused. Multiple placements remain #635. Sharing changes neither the Grant's future route nor later collection. Unbinding or losing membership fences not-yet-started effects while preserving accepted Channel history and independent work.

## Consequences

Sharing is an explicit disclosure to existing Channel members; a code revert cannot retract that accepted history. Recovery uses forward corrections through the existing owners. No schema, Provider SDK, new account or additional receiver is required. Source content stays external, untrusted material and does not gain Memory authority through local placement.

References: [#636](https://github.com/BotHarness/BotHarness/issues/636), [#629](https://github.com/BotHarness/BotHarness/issues/629), [ADR-0108](../decisions/im-providers.md#adr-0108), [ADR-0113](0113-shared-external-traffic-uses-member-channel-harvest.md).
