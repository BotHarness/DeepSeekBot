---
Status: Proposed
Date: 2026-10-07
---

# An external conversation streams into a Channel as one-way context

A person wants a Lark group, Slack channel, Discord channel or IM DM to feed a Channel the way a webhook does: every message arrives as context, and Bots wake only when addressed or when a wake rule says so. Today that needs a Bot-owned Channel Bridge route on a bound app, a prior ordinary message as proof, and it wakes every member on the platform default. This ADR makes the connection Channel-owned and one-way, listed under External connectors next to webhooks.

This amends [ADR-0112](0112-channel-bridge-intake-is-managed-at-the-existing-grant.md) and [ADR-0120](0120-multiple-bridge-routes-retain-canonical-sources.md) (a Channel route no longer needs a member Bot's grant), [ADR-0109](0109-external-group-collection-is-separate-from-wake.md) (no prior ordinary delivery is required to connect) and [ADR-0142](0142-a-bound-app-admits-its-direct-messages-and-mentions.md) (an unbound app can be received for ingest only).

## Context

ADR-0142 made a Binding the gate for an app's DMs and mentions. It also left the External connectors entry free for one-way input streams. Today a person can put an IM conversation into a Channel only through a Channel Bridge route on a Bot's own conversation entry (ADR-0112, ADR-0120). That has three limits:

- **It is Bot-owned.** A route is stored in the receiving Bot's grant body (`channel-bridge.ts:17-30`). Adding one requires that Bot to be a current Channel member (`channel-target.ts:51`, called from `inbound.ts:1474`). An app that no Bot uses has no grant, so it has nothing to attach a route to.
- **Reception only runs for bound apps.** The account receiver starts per Binding, through `startControl` (`inbound.ts:1254-1257`, started from `messaging_bindings` rows at `inbound.ts:1440-1445`). It refuses when the Bot is inactive. `defaultTraffic` drops ordinary group text at `inbound.ts:1168`. Ordinary text reaches a Channel only through a grant lease whose route says `collection: 'all'` (`inbound.ts:624-647`).
- **"All messages" needs a prior proof.** Adding an all-text route refuses with `ordinary-delivery-unverified` until a non-mention message has already arrived on that lease (`inbound.ts:1515-1521`, ADR-0109). In practice the person must send a test message before connecting.

Placed ordinary messages also wake every member through its `group-ordinary` default (ADR-0113, `member-admission.ts:10-40`, `defaults.ts:91-116`). The built-in platform default is `digest` (`defaults.ts:46`), so a busy group would wake every Bot every few messages. Vain's decision is that ingested messages are context, and Bots wake only on an @ or a wake rule that matches.

Much of what this needs already exists:

- One Provider Consumer per account, fanned out to subscribers, acknowledging only after every subscriber persisted the event (`consumer-fanout.ts:7-80`, ADR-0120).
- A canonical Source Event ID built from provider, app fingerprint, conversation and message, independent of Bot and grant (`inbound.ts:259-270`).
- Channel placement and projection (`channel-target.ts:64-130`).
- Member Admissions with Channel wake overrides and a bounded mentions-only context harvest (ADR-0113).

## Decision

**A Conversation ingest is a Channel-owned, one-way connection.** It is a new Messaging record keyed by Channel, Provider, app fingerprint, conversation kind and conversation ID, with a revision, an enabled switch, an intake-after boundary and a display name. It belongs to the Channel, not to a Bot. It authorizes exactly one thing: placing that conversation's messages into that Channel as Source Events, with member Admissions. It grants no reply, proactive post, history read, file read or Memory authority, to any Bot. Because the conversation still has an app on the other side, the UI calls it an external conversation (外部会话). It joins webhooks under External connectors as a one-way input. An app Binding stays the two-way connection.

**Who may connect.** Only the local Human may connect, through an authenticated Host command. That Human must be a current member of the Channel (`humanBridgeChannel`, `channel-target.ts:11`). They pick an app the same-Host Provider reports as connected, whether or not a Bot uses it, and then a conversation of that app. No Bot tool can create, change or remove an ingest in this version. The record and its commands do not assume a Human caller, so a later decision can let a Bot own sources it connects itself, for example a Bot on its own server ingesting internet feeds into its Inbox. Connecting an app that another Bot uses is allowed, because ingest gives no authority over that Bot's identity. The dialog names that Bot so the person knows.

**What can be connected.** Group conversations (Lark groups, Slack public channels, Discord guild channels) and DMs. A DM is private between one person and the app, so connecting one shows that every Channel member and member Bot will read it, and asks for confirmation. Channel Bridge's DM refusal (`inbound.ts:1466-1467`) does not apply to ingest. WeChat (iLink) apps have only the QR-paired owner's DM and no groups. They are not listed, and the owner DM keeps its private path (ADR-0129, ADR-0139).

**Reception.** An ingest subscribes to the account's existing fanout as one more subscriber:

- If the app is bound, it shares the Binding's registration.
- If the app is not bound, the ingest acquires the account's exclusive Consumer itself.

Acquiring the Consumer moves the app to the Provider's `external-consumer` mode (`dsh-im/src/channels/feishu/multi-bot-controller.mjs:601-622`). The Provider's own standalone Session stops answering that app. The connect dialog states this and asks for confirmation. While no Binding exists, the app's DMs and mentions are acknowledged without admission. Each event still produces at most one canonical Source Event per account, conversation and message. Ingest and Binding paths for the same message converge on the same Source Event, through the unchanged `sourceId`. Admission, acknowledgement after commit and redelivery stay as in ADR-0106. Source Events from an ingest record the ingest ID and revision as their anchor, in place of a grant (`ExternalSource.grantId`, `inbound.ts:119`).

**All messages, no prior proof.** An ingest always collects every message the Provider delivers for that conversation. The first ordinary delivery is no longer a precondition for connecting. Until one arrives, the row says "waiting for the first message". It also names the platform requirement:

- Lark: the `im:message.group_msg` scope.
- Slack: public channel, with `channels:history`.
- Discord: the Message Content intent.

When the Provider can report that requirement directly, the row shows it instead (slice 6).

**Wake.** Each ingest has a wake policy, edited with the same controls as a Channel Bridge route (context only, digest, immediate, per member override). The default is context only: placed ordinary messages create member Admissions in `mentions` mode. They join a later addressed turn's bounded context and never start one. A Bot is woken by:

- a local @ in the Channel;
- its own app being @mentioned in that external conversation, through the unchanged default-traffic path;
- a Channel wake override the person set for that Bot (immediate or digest).

This default applies only to ingest placements. Existing Bridge routes keep their current inheritance until they are converged (slice 9).

**Replies stay with identities.** A Bot that reads an ingested message can answer in the Channel. It can answer in the external conversation only through its own active entry for that conversation (ADR-0122). For an unbound app, the conversation is read-only from BotHarness in this version. Answering through the ingested app's own authority is a reasonable later extension and needs its own decision.

**Lifecycle.**

- Pause: messages are acknowledged without placement, and history stays.
- Delete: the revision increases, history stays, and nothing is backfilled.
- Reconnect: a fresh intake-after boundary. Nothing earlier is fetched.
- Several Channels may ingest the same conversation, each with its own record (per-Channel placement uniqueness, ADR-0120).
- If the Provider app disappears or its fingerprint changes, the ingest shows `rebind-required` and stops placing.

**Picking a conversation.** The picker lists conversations from an optional Provider capability that lists the conversations the app is in now, the same capability ADR-0142 proposes for proactive posts. Until a Provider has it, the picker offers that app's known conversation entries: the active and held entries of a bound app. An unbound app without the capability cannot be connected yet.

**Client.** The External connectors entry gets **+ 接入外部会话** (Connect an external conversation): first the app, then the conversation, then confirm. Each ingest row shows the app, the conversation, its state and when the last message arrived, with Pause and Delete. A group conversation row in an app's conversation list gets an **接入到 Channel** shortcut that opens the same dialog with the conversation already chosen. **保存发送目标（高级）** moves from External connectors to the app's edit dialog, because it is outbound authority for that app.

## Consequences

- `GLOSSARY.md` gains _Conversation ingest_ (外部会话接入). _Bridge_ is narrowed to the Bot-owned route until slice 9 converges the two. The architecture's Messaging section gains a Channel-owned one-way anchor next to Binding-keyed reception.
- Unbound apps become BotHarness-held once connected. Their standalone replies stop. That is the cost of a single exclusive receiver per app (ADR-0136).
- dsh-im needs new capabilities, each in its own Provider release with real-platform evidence:
  - conversation listing, per platform;
  - Lark scope status;
  - forwarding Lark rich-text (`post`) messages, which the consumer currently drops (`external-consumer.mjs:21`);
  - optionally, conversation-anchored history.
    The current history reader works only from a known message (`history-reader.mjs:16`).
- Messages from other bots are not delivered, on Lark (`external-consumer.mjs:19`) and generally on Slack and Discord. "All messages" means all human messages the platform gives the app.
- Schema: a new generation adds the ingest table and the Source Event anchor. It does not rewrite existing grants or Source Events. An older Bundle must refuse it. Recovery is a forward fix or the migration owner's pre-upgrade snapshot.
- Security trade-off: anyone in a connected group can put text into the Channel and into the context of every member Bot. That is the same exposure as an all-text Bridge today (ADR-0113). External content stays untrusted, gains no Memory or tool authority, and wakes no Bot unless someone addresses it.

## Alternatives

- **Require binding the app to a member Bot first:** rejected by Vain. One-way listening should not need a Bot identity on the platform.
- **Store ingest as a grant row with a null Bot:** rejected. It overloads the per-Binding anchor that revocation, Outbox and ADR-0122 checks rely on.
- **Keep the per-conversation-row Sync as the only path:** rejected. It cannot reach unbound apps and hides the Channel's inputs from the Channel's own sidebar.
