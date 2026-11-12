---
Status: Accepted
Date: 2026-10-03
---

# External platform defaults retain explicit inheritance

Human confirmed global defaults with per-Profile overrides in #701, refining #693 and #629. Messaging owns a bounded Lark preference revision under the existing operational database authority. The authenticated Typert/API Gateway exposes the same effective values to Bot settings, PersonaBot identity and Channel Bridge views, and Bot tooling. The first qualified event type is incoming group text; this does not claim Slack, Discord, QQ or webhook qualification.

## Decisions

Global defaults separate collection, ordinary-message wake/harvest, and identity enabled preference. They cannot bind an account, create or expand a Grant, select a destination, follow a Thread, or compel a reply. Actual Provider qualification and the existing account/target/dispatch checks remain mandatory.

A new qualified identity or managed Bridge explicitly inherits. Generation 51 marks legacy identity and reception settings custom, preserving their previous behavior. An explicit Profile change stores a scoped override; restoring inheritance resolves the current global revision, rather than copying its values into an unmarked override. Global and scoped saves compare the displayed revision, refusing stale commands. Settings draft refresh does not silently discard an unsaved edit.

Collection resolves explicit Thread rules first, then the Bridge/source override, then platform defaults. A shared Channel's ordinary external wake resolves the member's explicit Channel policy, then its explicit PersonaBot ordinary-source rule, then the platform preference. Local Channel messages retain their existing defaults. A followed Thread keeps its explicitly scoped wake rule. The canonical message is shared, while Inbox Admissions remain per member; no shared Inbox store is introduced.

Each new external Source Event retains the effective platform, reception and Bridge revisions; each ordinary admission retains its own thresholds and global revision. Digest partitions include the saved revision so a new threshold cannot consume an older pending bucket. Updating defaults never rewrites previously accepted content or admission decisions.

Identity preference is resolved through the existing identity owner. A global pause increments inherited identity revisions, reconciles their Consumer leases and refuses not-yet-started effects at the existing dispatch gate. A resume revalidates the existing account and authorized target and records a receive-after boundary on inherited Grants, preventing late pre-resume events from being admitted. It does not request backfill. Started outcomes remain truthful in the existing Outbox. This boundary depends on qualified Provider timestamps and an aligned clock.

## Consequences

An inherited all-message preference is visible even before ordinary delivery is verified, but the view clearly states that actual delivery is unverified. A preference is not evidence of permission or capability. Explicit custom all-message selection retains the existing qualification gate. Restart retains defaults, inheritance markers, old admissions and receive-after boundaries. Live views refresh through the existing roster event without introducing browser persistence or another scheduler.

Validation covers migration, precedence, stale commands and drafts, restart, immutable thresholds, capability refusals, identity pause during asynchronous inspection, and the production-shaped qualified Lark path. Per-issue Human QA and independent merge authorization remain required.

## Qualified Slack extension (#843)

After #837 qualifies fresh public-channel Human text, Slack uses the same canonical
platform-default owner and independent revision sequence. Bot settings selects Lark
or Slack; each editor retains its own dirty draft and stale-save revision across
platform switches and live notifications. The public read command accepts an optional
qualified platform, defaulting to Lark for older Consumers, and rejects unknown values.

Generation 53 broadens the existing defaults table's platform constraint to Lark and
Slack, copies every prior immutable row unchanged and recreates its immutable triggers.
It changes no existing identity or scoped policy inheritance marker. New qualified Slack
identities inherit; existing custom identities require an explicit restore-inheritance
command. Older Hosts cannot open generation 53: rollback requires a compatible Host,
forward repair, or restoring a pre-upgrade Profile backup, not a blind binary downgrade.

Slack collection, harvest and identity preferences retain all existing authorization,
ordinary-delivery verification, policy snapshot and resume-boundary gates. The qualified
event remains fresh public-channel Human text; changing its default does not qualify
private/DM, ordinary file events or autonomous thread following.

## Qualified WeChat owner-DM extension (#912)

WeChat uses the same immutable platform-default owner for identity enablement and the
native typing preference qualified by #911. New WeChat Bindings inherit each preference
independently. Generation 69 extends the platform constraint and adds `typing_inherited`
with a legacy default of zero, retaining every existing enabled/typing choice as custom.
An explicit restore resolves the current global revision; changing typing alone does
not change identity enablement inheritance. A global typing change invalidates only
inherited live leases through the existing process-local owner. Nothing restores active
typing on restart.

Current WeChat intake remains the QR-paired owner DM, collected in full and admitted
directly. Group mentions, ordinary-group harvest, Threads and new-contact admission
are not qualified settings and are absent from its editor. Global saves reject those
unsupported combinations. Channel connectors retain their own destinations, switches
and member policies. Defaults neither add a Binding/Grant nor authorize another target.
Generation 69 also adds a nullable Binding `receive_after` boundary. Resuming an
inherited identity records it even when no conversation Grant exists yet; both the
Binding Consumer and existing implicit Grant admission exclude delayed pre-resume
events. Explicit custom identities retain their behavior. Schema rollback requires a compatible Host
or the existing pre-upgrade backup procedure; never downgrade a generation-69 database
into an older binary. Native fresh-message and typing observations remain Human QA.

## QQ defaults extension (#3419)

QQ uses the existing application-owned platform-default revision store and authenticated API/CLI. Forward generation 138 widens the immutable defaults table to QQ and copies every prior row unchanged, including rows from the historical generation-116 hotfix. Historical migrations remain unchanged; generation 137 separately repairs the skipped question schema. New QQ groups inherit the configured defaults; existing custom identity and group choices remain custom until explicitly restored. Inherited all-message collection is a preference, not ordinary-delivery evidence: the explicit custom-all qualification gate remains enforced. This does not qualify unsupported media or authorize another conversation. Rollback requires matching packages and a fresh complete pre-upgrade Profile backup, not a package-only downgrade.
