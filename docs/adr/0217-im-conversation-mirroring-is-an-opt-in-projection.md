# ADR-0217: IM conversation mirroring is an opt-in projection

- Status: Accepted
- Date: 2026-10-16
- Spec: [#1990](https://github.com/BotHarness/DeepSeekBot/issues/1990)
- First slice: [#1983](https://github.com/BotHarness/DeepSeekBot/issues/1983), PR #1988

## Context

ADR-0129 keeps external private messages in the Bot Inbox without placing them in the Human DM. People also need a local view of their IM conversation. Re-inserting its text as a local message creates another content authority and can leave readable copies after Content Purge. Forwarding local content is a separate external side effect.

## Decision

Both directions are explicit, independent, default-off choices for a Binding and its qualified private conversation. WeChat is the first qualified adapter; Lark, Slack, Discord and QQ require their own slices. Application-defined `dmMirror` and `dmForward` controls do not change DSH Agent Inbox or Session Persistence semantics.

Messaging owns the preference. Grants in the same Binding and exact conversation resolve one effective version; a newer setting propagates to existing equivalent entries. A newly discovered Grant reads that version instead of granting new consent. A new Binding starts off. Enabling mirroring creates a new epoch, recorded on accepted sources and outbound intents, so redelivery or recovery cannot backfill an earlier generation. Grant reply authority keeps its existing revision.

Inbound mirrors add a Channel placement of the same Source Event, without another Admission. The source records which additional placement is a display-only mirror. Its text and safe attachment names derive from canonical content; existing explicitly connected Channels retain their checked media behavior.

Accepted outbound operations can have a deterministic local Source Event carrier linked to the Outbox intent and, for replies, the originating source. The carrier has Bot authorship and external provenance. Content Purge clears both linked Outbox content and its presentation carrier. Purging the carrier also clears its linked Outbox content. Projection commits recheck the current epoch, Binding and purge fence. Provider registration/reception startup recovers missing eligible projections in ascending batches of at most 100, advancing past ineligible records; it never retries sending.

Forwarding selects a qualified target only within the opted-in Binding and exact conversation. Implicit receivers may use an explicit proactive target in that scope. All parts stay on that target; another account is never a fallback. Existing Outbox idempotency and uncertain-outcome rules apply. The Provider’s final send fence checks the captured control generation, and every new part repeats this check. An off/on cycle invalidates pending work. Turning off is possible while the Provider is offline; already accepted remote sends cannot be recalled.

Each switch has an adjacent, keyboard-accessible clickable info control. The existing connector edit form commits both fields through the existing Host bridge and CLI JSON input, with stale-form rejection. The form’s Save boundary is deliberate: it preserves its single atomic revision check.

## Consequences

No default reception or new permission is introduced. Existing local records remain when a switch is turned off; Content Purge is the separate destructive operation. This is not bidirectional edit/recall synchronization. Real IM acceptance remains separate from simulated Provider, Host, CLI and Web validation.
