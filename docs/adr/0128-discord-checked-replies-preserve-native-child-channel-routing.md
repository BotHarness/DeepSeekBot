# ADR-0128: Discord checked replies preserve native child-channel routing

- Status: Proposed; development-source mention/reply implementation qualified by agent-operated native/model E2E; product Provider promotion and additional capabilities remain separate
- Date: 2026-10-05
- Issue: [#855](https://github.com/BotHarness/BotHarness/issues/855)

## Context

The generic dsh-im Discord transport creates native threads after channel mentions and owns standalone DSH Sessions. BotHarness needs the existing canonical Inbox/Orchestrator path, with a responder's own identity and a reply in the original channel or an existing public thread. Generic SDK support does not qualify this application-defined contract.

## Decision candidate

Keep the DSH-native Plugin/Fiber and checked Service Definition → Provider → Consumer seam. The Provider owns one Gateway connection and DSH credential references. Messaging retains Binding, Grant, Source Event, Inbox Admission, trusted Reply Route and Outbox; the existing Orchestrator owns execution. No schema migration, transcript store, receiver or provider-specific Session runner is introduced.

The Provider authenticates the current Bot user and associated Application using native API calls and checks the Gateway READY App/user pair. Fingerprints include App and Bot user IDs, never tokens or mutable names. Snowflakes remain strings. A Profile can explicitly set the Discord Provider's `consumerMode: external-consumer` before connecting accounts. This prevents a privileged-content/standalone Session bootstrap before the Human binds the identity. Standalone configurations retain their original mode. Claiming a checked Consumer persists external mode; missing/disposed leases and restart do not restore standalone processing.

The mention path requests `GUILDS` and `GUILD_MESSAGES`, checks native addressing evidence and accepts bounded Human text from guild text channels or existing public threads. Native `mentions` identifies user mentions. The #1615 extension below separately qualifies the authenticated Bot's own managed role; unrelated role mentions, display names, `@everyone` and `@here` do not address the Bot. Own Bots and webhooks are suppressed. Gateway sequence plus session identifies delivery evidence; it is not a durable replay cursor or per-message acknowledgement protocol. Canonical message identity and per-Bot Admission deduplicate redelivery in Messaging.

For a text channel, external conversation and native destination are that channel. For an existing public thread, external conversation is its verified parent text channel, while `threadId` is the native child channel ID. Check parent/child guild correspondence. Discord `parent_id` is a parent channel, not a parent message. No root or parent message ID is fabricated from it or from a reply reference. Thread following remains unavailable in this slice because that independent contract has not been qualified.

Before reply, read current guild roles, the Bot member and parent-channel overwrites using the official permission order and exact integers. Require VIEW_CHANNEL, READ_MESSAGE_HISTORY and the appropriate SEND_MESSAGES or SEND_MESSAGES_IN_THREADS permission; refuse timed-out members, private threads and archived/locked threads in this candidate. Read the exact source in the native destination and verify its actor/message/route. Run the latest BotHarness fence immediately before one native Create Message call with retries disabled, mentions suppressed and a required existing source reference. Verify returned native author, destination and message ID before recording a canonical receipt; its conversation ID remains the authorized parent conversation while checked `threadId` retains the actual destination. Do not redirect or blindly retry an unknown outcome.

Core platform registration, Inbox/source DTO validation and the existing Client source label admit Discord through these checked contracts. Global defaults editing, ordinary intake, context windows, files, autonomous thread following, shared Channel qualification and proactive canonical receipt are separate real tracers. Their capability ledger remains unqualified.

## Own managed-role addressing — #1615

Discord offers both the App's Bot user and its integration-managed role under the same visible name. Treat only the latter's verified native ownership as another way to address the same Bot: the mentioned role's string ID must occur in the original `mention_roles`, the current native guild role must have `managed: true` and `tags.bot_id` equal to the authenticated Bot user ID, and that Bot's current guild member must hold the role. The everyone role is excluded. Reuse the existing checked channel/guild/member query and receiver lifetime; do not add a role cache, message store, listener or Core role-name heuristic.

The Provider uses the same predicate for early ingress and final normalization. The original text, user mentions and source-bound reply route stay intact; a role is not fabricated as a user mention. Other roles and everyone/here remain non-addressing even when the Bot holds those roles. They may be retained only through separately authorized ordinary collection, without direct-mention attention. Missing or changed native ownership cannot widen intake. A disposed or replaced receiver cannot deliver a result from an earlier lookup.

This is checked addressing, not authorization to join a guild, acquire Message Content intent or access unavailable message content. Role ownership and application permission do not prove actual Gateway delivery. The controlled Runtime/Consumer regressions and fresh installed-product native/model qualification passed for the #1615 candidate on 2026-10-16 JST: own managed role and Bot-user mentions each received one source-bound reply; an unrelated role held by the Bot, everyone and here created no attention or send. The test App already had Message Content approval. See the [qualification record](../dev/verification/discord-1615-managed-role.md) for exact artifacts, cleanup and review limits. Earlier #855 evidence does not qualify this extension; public release remains separate.

## Evidence boundary

Initial Provider candidate source: `e6f0de2a989c28d20db92c0e7f43b20c6d3028b9`, based on the then product-pinned Provider `48e7a35792af5222cd40cfe1ba2607ac55a59df2`. Those controlled Provider and assembled-Core tests alone did not qualify real Discord behavior. Subsequent agent-operated native/model E2E, original-location receipts, runtime provenance and screenshots completed the narrow **development-source mention/reply qualification** in [#855](https://github.com/BotHarness/BotHarness/issues/855) / [#934](https://github.com/BotHarness/BotHarness/pull/934), under the Human's revised acceptance instruction; no manual Human QA gate remains for that slice. Additional capabilities, installed-product qualification and Provider promotion retain separate evidence and authorization. This ADR's formal status remains Proposed; merge, deployment and publication require their own authorization.

## Local Host checkpoint — 2026-10-05

An isolated DSH `0.2.0-rc.1` Profile loaded BotHarness candidate `ea5ca546` and the local Provider candidate through their real Bundle layers. Authenticated `/api/botharness/list` and `/api/dsh-im/discord` status returned HTTP 200 with `ok: true`; the Discord controller reported zero configured/connected accounts. The composed Profile retained `discord.consumerMode: external-consumer` before any account connection. The Provider runtime digest covered 394 files with SHA-256 `2d1f6c0d313cf044024e7e2609070934249e4a00a4a777f09aa45b2dd2c89727`. This proves candidate Host loading and Profile composition only; it provides no native Gateway, real mention/model reply, visual or Human acceptance evidence.

The same isolated Profile also completed a real model DM probe at `2026-10-05T08:49:17.791Z`: a dedicated PersonaBot received the Human request, used `channel_send` to append `DISCORD-LOCAL-MODEL-855-OK` to that same DM, and returned to idle with its Session marked done. The Human message's delivery was handled. This verifies local Inbox/model/Channel execution with the actual Host adapter; it does not verify Discord intake, native external delivery or thread routing.

## Live external checkpoint

The dedicated Discord App and QA guild passed both original text-channel and existing public-thread mention/model replies, including the recovery and refusal cases recorded in [native receipts, screenshots and exact revisions](../dev/verification/discord-855-mention-reply.md). The first development-source mention/reply slice is qualified; broader capability acceptance and product Provider promotion remain separate. [#937 context-read verification](../dev/verification/discord-937-context-reads.md) records its independently completed cases and remaining native continuation/conflict checks.

## References

- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
- [Discord Application](https://docs.discord.com/developers/resources/application)
- [Discord Threads](https://docs.discord.com/developers/topics/threads)
- [Discord Permissions](https://docs.discord.com/developers/topics/permissions)
- [Discord Message API](https://docs.discord.com/developers/resources/message)
- ADR-0036/0037/0038, ADR-0126/0127; CONTEXT.md; #629/#693
