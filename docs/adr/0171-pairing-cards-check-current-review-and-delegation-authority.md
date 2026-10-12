# ADR-0171: Pairing cards check current review and delegation authority

- Status: Accepted
- Date: 2026-10-11
- Issues: [#1404](https://github.com/BotHarness/DeepSeekBot/issues/1404), [#1414](https://github.com/BotHarness/DeepSeekBot/issues/1414)
- Supersedes: no prior ADR; extends ADR-0165 and ADR-0168

## Context

An external person may need ordinary Chat pairing where opening Web or establishing a private DM is inconvenient. The Human requires a group-only Lark path: everybody can see the request, but only pairing reviewers may decide. Existing native execution Approve/Reject does not authorize granting a Role. Management Roles are allowed, with a current explicit delegation ceiling.

Automatically granting every execution approver the ability to enroll other administrators would broaden existing authority. Requiring a private DM would exclude the confirmed group-only scenario. A visible card, copied request or natural-language agreement cannot establish actor authority.

## Decision

Messaging owns application-defined pairing review and its durable Operational Database facts. Add explicit `review-pairing`; using a management capability and delegating it are separate grants. Current Role/group/person delegation Allow is combined, then any applicable delegation Deny is removed. Old records default to no new review/delegation authority. A selected Role's structured capabilities and onward-delegation grants must both fit the reviewer's current ceiling.

An intentional unpaired group @ creates the existing metadata-only pending Chat request and a shared card in that authorized source group. Eligible reviewers with a trusted private route may also receive a private copy. A group-only reviewer needs no private bootstrap. The qualified Provider verifies the original message and conversation; its existing exclusive Consumer dispatches a distinct pairing callback namespace, independently of native execution approval actions. Native execution cards remain private in their existing qualified path.

Each callback checks the actual platform operator, Bot/current App Binding, original card receipt/conversation and current review authority. Role selection pins the Role revision and selecting operator. Confirmation must match that operator and selection; it cannot accept a different reviewer's intervening choice. Current delegation and exact request/Role revisions are checked again in the canonical pairing transaction. The first valid Web/IM decision wins, and subsequent controls are refused.

Generation 80 stores bounded pairing-card delivery receipts, status and selections in `messaging_pairing_cards`. Uncertain sends are not automatically duplicated. Accepted receipts and selections survive restart within the original request lifetime; expiry, rebind and current revoked authority still fence them. Canonical pairing remains authoritative when an external visual update fails. Final shared/private cards remove controls after reconciliation. The Host Fiber closes its timer and aborts sends/updates on disposal.

The card publishes only applicant/reference/conversation/Role/expiry/result metadata, not blocked instructions or private native operation arguments. Group visibility is Human accepted. Approval sends the fixed ask-again notice to the applicant's original conversation; neither intake nor card controls create model work, request Inbox Admission, wake or Task, and old instructions are never replayed.

The authenticated Web Human retains existing full authority and Web pairing review. IM reviewers can approve/reject the exact pending ordinary Chat request, assigning one existing Role; they cannot edit Roles/groups or acquire Web machine authority. API Gateway and the current authenticated Client commands own settings. No DSH-native RBAC, second Provider listener or parallel decision store is introduced.

## Consequences and delivery boundaries

- Group visibility and decision permission remain separate. Shared Role choices can show a candidate permitted to another reviewer; each operator still needs their own current ceiling. Selecting a Role is not approval.
- Web remains available when private delivery is absent or uncertain. A failed card update cannot undo or repeat an accepted pairing.
- Separate delegation controls add explicit setup but prevent existing approvers from implicitly becoming administrator recruiters. A reviewer can be allowed to delegate a capability without having permission to use it personally.
- The first tracer must prove the real Lark group-only and DM paths plus negative controls, current permission loss and restart, and obtain Human feedback. Platform capability evidence is required separately for QQ, Discord, Slack and other extensions.
- One-time codes remain the explicit forwarding alternative in #1404 after first-card feedback; this ADR does not claim code issuance/redemption delivery.
- Native questions, rule saving and native execution approval destinations remain with #1019/#1031/#1033/#1034 and their existing owners/gates. Pairing does not implicitly grant those capabilities or expose private requests to a source group.
- Back up before upgrading. Reverting source does not downgrade an upgraded Generation 80 Profile; use a compatible writer or restore the pre-upgrade backup.
