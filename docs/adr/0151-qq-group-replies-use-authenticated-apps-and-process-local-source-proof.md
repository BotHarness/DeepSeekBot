---
Status: Accepted
Date: 2026-10-08
---

# QQ group replies use authenticated apps and process-local source proof

The first QQ slice in [#1152](https://github.com/BotHarness/BotHarness/issues/1152) receives a group mention and answers through the receiving official application. QQ group/member OpenIDs belong to that application, passive replies have a short lifetime, and the available API does not offer a general group-history read. Treating those locators like a portable Lark source would imply authority that QQ has not supplied.

## Decision

Use the existing dsh-im Service Provider and exclusive Consumer contract. The Provider owns credentials, official SDK transport, application authentication and native route proof. BotHarness owns the application's Binding, canonical Source Event and Inbox Admission, Orchestrator wake and Outbox intent. No standalone Provider Session runs while its persisted external-consumer mode is active; losing a lease does not change that mode.

The authenticated `GET /users/@me` robot-details response supplies the native identity. Combine its ID with the configured AppID in the account fingerprint. Live responses may omit the documented example's `bot` flag; an explicit non-robot or malformed flag still refuses qualification. Application changes invalidate the Binding fingerprint.

Only text-only `GROUP_AT_MESSAGE_CREATE` events enter the first slice. Their event type is the mention proof; the SDK need not reconstruct an @ token stripped by QQ. Retain the exact application-scoped group, member, native message ID and timestamp. Canonical deduplication uses the authenticated account and native message identity.

The Provider keeps a bounded, process-local copy of each admitted source, independent of consumer-owned objects. It qualifies only that exact group/member/message tuple, within five minutes and at most five attempted replies. Thread routes are refused. Its public replay contract reports possible gaps and no durable cursor. Restarting removes source proof but preserves canonical history; a native redelivery can establish fresh proof subject to the source's original time limit.

Before native dispatch, prepare the official SDK token, then recheck source, current application, lease, cancellation and the trusted synchronous consumer authority fence. There is no asynchronous step between the final fence and native API dispatch. Preserve definite expiry, limit, rate and permission refusals. An unclassified or interrupted send is unknown and must not automatically retry or fall back to proactive messaging. Return QQ's native message ID only after a valid response; it proves provider acceptance, not delivery or reading.

Advertise reply-only checked capabilities independently of proactive messaging. Ordinary traffic, media, history and delayed proactive reports require their own qualified slices. In particular, authenticated group mention support is sufficient to make an app bindable; it must not require an unrelated proactive capability.

## Consequences

The first real path reuses the existing Source Event, Bot Inbox and Outbox, with no second transcript, persistence or credential store. Old sources remain inspectable after restart, but may no longer be replyable. Receiver lifecycle diagnostics must clear readiness on disconnect and expose bounded failures, because an online badge alone cannot prove current authority.

Direct, source-free group sends and universal source rereads are rejected alternatives: the first bypasses passive-reply authority, and the second depends on a QQ API this slice does not have. Expanding capability flags ahead of native qualification would hide these limits from the Host and Human.

This specializes [ADR-0142](0142-a-bound-app-admits-its-direct-messages-and-mentions.md) for QQ and preserves the ownership boundaries in [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md).

## File-quote extension (2026-10-08)

The #1158 candidate may acquire a file embedded in the current native group mention as a type-103 quote. Human feedback established that the QQ client sends file upload and mention as separate messages; proximity supplies no authority. Accept only one raw quote block containing actual file descriptors, with matching current message/group/author identity and consistent block, normalized and supplied raw reference indices. The reference qualifies the private resource selector; it does not become a historical Source Event or passive-reply message ID. The current mention owns canonical intake, attachment acquisition and the original-group reply. Existing account, consumer, Grant, bounded-download and final-send checks still apply. No Provider history/cache lookup or quoted-image expansion is introduced. A scalar `message_type:103` on that block is metadata, not structural nesting or authority; recursive quote fields still fail closed. Real acceptance on 2026-10-08 qualified one authorized application: a quoted CSV reached canonical intake, an independent working copy was read, the immutable original was preserved, and a distinct result file received an original-group native receipt plus Human download/content confirmation. This evidence does not qualify other applications or the direct-file carrier; those remain separate from SDK support and automated regression.

See the [official SDK quote mapping](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/protocol/gateway/event-dispatcher.ts) and [embedded attachment resolution](https://github.com/tencent-connect/qqbot-nodejs/blob/main/src/middleware/quote-ref.ts). The Provider retains only the latest bounded ingress-shape diagnostic as process evidence; no private URL or message content enters it.

## Incoming-voice extension (2026-10-08)

The #1159 extension reuses current mention authority and the same single native quote proof for one voice attachment. Explicit transcript and original-audio capabilities pass through the existing Service and exclusive consumer; only native `asr_refer_text` establishes platform provenance. Unavailable transcripts stay explicit. Original private audio is acquired lazily into canonical attachments; a separately identified playback Artifact uses the existing bounded SILK Worker, with WeChat's native encoding policy kept in its own wrapper. No second transcript/media authority, cloud ASR credentials, ordinary reception or outgoing voice is introduced. Playback does not establish semantic understanding; optional native WAV URLs remain private and unused. One maintained-runtime application qualified explicit QQ voice quotation, native ASR, original download, actual Client keyboard playback and own-app original-group text understanding on 2026-10-08; the Human confirmed the answer. This does not qualify absent ASR, other codecs or the modern upstream Host. A voice quote may omit redundant caption text; current native envelope/reference authority remains mandatory.
