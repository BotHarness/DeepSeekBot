# Channels are platform-native spaces; Binding connects a PersonaBot to any surface

A Channel is a first-class platform entity where PersonaBots and humans collaborate — join/leave, speak, receive events — and it can bridge one or more external Chats so their humans take part (Lark first, M5). What a Channel shares is its conversation and durable facts, not model context: each Session reads what it needs. The old "Channel binding" is generalized to Binding: a PersonaBot's connection to a surface it takes part in (Channel, Chat, sidebar, renderer). Inbound messages are no longer routed to a fixed Session by binding; the Orchestrator Session decides dispatch (ADR-0024). We chose an in-software space over "the Chat is the only space" because agents need groups without an external platform, and because membership, routing, and history stay ours to shape; bridging keeps humans in the loop where they already are.

## Considered Options

- **External-first (Chat only)** — rejected: no agent-only or in-software groups; an external platform would own membership and history.
- **Channel as an alias of Chat** — rejected: different lifecycles, ownership, and identity mapping.
- **Binding-routed Sessions** — superseded by ADR-0024: bindings connect surfaces; dispatch is the Orchestrator's decision.

## Consequences

- `GLOSSARY.md` changed: Channel and Inbox added, `Channel binding` → `Binding`, Thread generalized to a Chat or Channel sub-conversation.
- M5 must define Channel ↔ Chat/thread mapping, external human identity, and the per-Channel Access policy.
- Reply scope applies to bridged Chats; Channel-native reply semantics stay an open item.

## Update (2026-09-18) — vocabulary and bridge mechanics

Channel types are `dm` (a PersonaBot and one human) and `group chat` (several members; informally a chatroom); every Channel keeps its local history in the authoritative Messaging store (ADR-0037). **Bridging is a configuration relationship, not an entity**: a **Bridge** connects an external source to an explicitly configured Channel or PersonaBot Inbox target, carries inbound delivery, and exposes outbound capabilities. It never auto-creates a Channel. An Inbox Trigger decides whether a resulting Source Event is admitted and which Wake Policy applies. A normal response uses the Source Event's trusted Reply Route and needs no model-selected provider; a proactive provider-specific post is a separate Service Action with its own authorization. Loop-back rules: a message never enters the sender's own Bot Inbox, platform echoes de-duplicate by external message id, and a message seen both locally and via echo merges into one. A user-configured Bridge may still ingest content that contains a Bot's own earlier message from another surface — such configurations are neither blocked nor validated, and provenance (Bridge, external chat/thread, external author) is recorded on the Source Event so the Bot can recognize where it came from. Sidebar grouping is a **Channel section** (ADR-0029). The Channel concept itself is unchanged; only the vocabulary and bridge mechanics are now explicit.
