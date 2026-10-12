# ADR-0174: Slack DM chat pairing reuses current Binding authority

Status: Accepted; bounded #1415 source-candidate Slack DM qualification and Human interaction feedback completed. Published product and Slack group/native-management qualification remain separate.

## Context

ADR-0165 defines ordinary chat pairing, one primary External User Role, metadata-only pending requests and fresh-question admission through the application-defined Messaging owner. Its first qualified surface was Lark. #1415 extends the same observable behavior to one Slack application DM; #1046 separately owns native Slack management pairing and execution approvals.

The selected checked Provider already normalizes native `message.im` events and validates its Slack workspace/bot identity with `auth.test`. Its account fingerprint, current exclusive Consumer and checked original reply route remain required. A display name or message text is never a sender identity.

## Decision

Extend the existing Messaging commands and Operational Database records without a new schema, listener or authority store. A Slack DM's actor uses the `slack-workspace-user-id` namespace, scoped by the current PersonaBot, Provider, App account reference, fingerprint and Binding. Validate the normalized user ID and actual DM route before making an ordinary pairing request. Namespace is attribution, not an account-wide grant.

The existing Bot sender-restriction switch applies to qualified Lark conversations and Slack DMs. It remains off by default. A restricted unknown Slack DM creates only bounded pairing metadata and a fixed notice; it creates no executable Source Event, request Inbox Admission, wake or Task and does not retain the instruction for later execution. Authenticated Web review assigns an existing Role. Approval uses the same checked notice path and asks the person to send a new question. Only a fresh valid DM can be admitted and answered under the same App identity.

Current permission and directory queries reuse the existing owner and canonical state, including primary Role and separate group/person management resolution. Revoke, Role loss, account disablement, rebind and stale scope refuse subsequent intake. Restart keeps current authority; replacement Binding and fresh pairing do not inherit old memberships or person exceptions.

This tracer does not qualify Slack group pairing, open groups, passive unpaired group context, native approval controls or review cards. The settings label explicitly names the two supported restriction surfaces. Slack `/pair` is a reserved control and never becomes model input; it does not create a native management grant. #1046 retains that capability and its own real-platform gate. Lark management commands and group review cards retain their current behavior.

## Consequences and qualification

No DSH-native RBAC is added. Native execution and Web Human authority remain unchanged. Natural-language Role/group behavior is prompt policy, not arbitrary filesystem, mail or Shell isolation. Current sender lookup and management checks remain separate.

The first real Slack test must prove pending → Web review → fixed re-ask → fresh own-app DM reply → revoke refusal → restart, with native rendering matched to Source Event/Admission/Outbox facts and Human feedback. Tests or an existing Provider DM success do not satisfy that gate. Shared production and other task receivers remain exclusive.

The isolated QA2 source candidate completed that sequence, including actual Web Role selection/approval, current permission and all three read-only directory queries. Only fresh approved questions produced bridged Source Events, handled Admissions and provider-accepted Outboxes; their receipt IDs matched the rendered Slack replies. Pending and post-revocation messages remained metadata-only. The Human accepted the interaction, and the task receiver stopped. See [PR #1436](https://github.com/BotHarness/DeepSeekBot/pull/1436) for current-head automated/visual evidence and the earlier receiver-conflict recovery; this does not qualify a published product, native approval or Slack group intake.

Profiles that already enabled the Bot-wide restriction will now restrict Slack DMs too; update the settings wording and guide rather than silently describe this as Lark-only. Before reverting to an older binary that lacks Slack restriction, disable the affected Slack Binding while deciding the replacement policy; older code must not be relied on to enforce this new gate. No schema downgrade or data restoration is required.

## Sources

- [#1415](https://github.com/BotHarness/DeepSeekBot/issues/1415), [ADR-0165](0165-lark-chat-pairing-is-reviewed-current-binding-authority.md).
- [Slack message.im](https://docs.slack.dev/reference/events/message.im/) and [Slack user object](https://docs.slack.dev/reference/objects/user-object/).
- Qualified Provider source `602baa37fa327f7069545aaadbbd34db8a8f4636`, `src/channels/slack/slack-runtime.mjs` and `slack-controller.mjs`: normalized native DM reception and current authenticated workspace/bot account checks.
