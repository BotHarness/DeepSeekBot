---
Status: Accepted
Date: 2026-11-01
---

# Cross-Host Bot DMs use online communication without outgoing queues

In the accepted design target of [#3250](https://github.com/BotHarness/DeepSeekBot/issues/3250), active PersonaBots in the same verified Tailscale tailnet or Tob Connect account automatically discover and contact one another through ordinary Bot-to-Bot DMs. Ordinary LAN discovery requires explicit admission to the collaboration scope. Contact queries include the Bot's owning Host/device facts, available capabilities and public description; the originating Bot chooses the colleague. The application-defined device communication bridge extends existing contact and message capabilities into the receiving Host's Channel and Bot Inbox authorities, preserving ADR-0065's conversation model and each Bot's private Memory and execution permissions.

Communication requires an online reachable device. Definite unavailability is a failed delivery; losing acknowledgement after transmission may produce an unknown outcome. Neither result creates an executable persistent outgoing intent, automatic retry or reconnect/startup replay, including for replies. The Bot decides whether to preserve a task, explicitly contact the colleague later or ask the Human. Accepted DM history and receiver Inbox persistence remain canonical and recoverable; they are not an outgoing transport queue. Receipt deduplication protects the same message identity without introducing a resend subsystem.

Temporary loss of connectivity affects communication, not existing local authority. Actual withdrawal from the collaboration scope prevents new communication and not-yet-started work from that relationship. Already-started work may finish under local permissions but cannot send results to the departed counterpart. Existing processing states and causal hop guards continue across Hosts. Routes do not create new Bot identities or grant general Human device-management access.

## Why

Bots need to choose useful colleagues by device and responsibility, while follow-up behavior remains controlled by their users. A durable outgoing queue would turn an unavailable send into a future external action without a fresh Bot decision. Provider paths with durable Outbox recovery must not lend their retry semantics to this bridge. A central dispatcher, copied private Session relay or additional Memory authority would obscure existing ownership boundaries.

## First Tailscale slice

The application-defined device owner reuses the existing Profile Host identity and binds a narrow Bot directory/message listener to the local Tailscale address. Current daemon membership and Tailscale whois establish the socket peer's collaboration scope. The directory advertises the existing device Noise public key; its contents alone never authorize a message. The existing Noise XK implementation proves both Host keys and encrypts one message and its acknowledgement. Its prologue binds the ordered sender and receiver Host IDs. Incomplete handshakes are bounded, expire and close on disposal; they contain no executable pending message.

First contact trusts an eligible tailnet device's advertised identity, then requires proof of possession before pinning its public key in the existing remote Channel participant. This is trust on first use within the verified tailnet, not independent proof of the first advertised Host name. The Channel owner atomically enforces one key per remote Host across its Channels, including when another local Bot first contacts that Host. Subsequent key changes are refused. The listener exposes no operator API or Device management credential; discovery routes remain volatile and no additional identity or message store is introduced.

The Channel owner stores a remote participant as Host plus Bot identity, with a distinct remote author kind. Only the real local Bot belongs to local Inbox admission. Both sides keep accepted history through their existing Source Event and Channel placement transaction. The sender writes accepted outgoing history only after remote acknowledgement; uncertain outcomes are never scheduled for resend. Public contact data in the Client is a current contact-query projection, not persisted private Bot state.

## Delivery status

This ADR records the confirmed target. Implementation and runtime qualification of the first route belong to [#3251](https://github.com/BotHarness/DeepSeekBot/issues/3251). Scope-withdrawal lifecycle, Connect, route continuity and explicit LAN admission remain dependent slices. A successful first route does not prove those behaviors.
