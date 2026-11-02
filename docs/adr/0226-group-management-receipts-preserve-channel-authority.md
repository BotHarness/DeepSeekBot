# ADR-0226: Group management receipts preserve Channel authority

- Status: Accepted
- Date: 2026-10-18
- Related: [#2090](https://github.com/BotHarness/DeepSeekBot/issues/2090), [ADR-0224](0224-tob-management-uses-scoped-native-shell-cli.md), [ADR-0225](0225-bot-creation-receipts-and-reviewed-profile-lifecycle.md), [ADR-0041](0041-one-database-owns-botharness-operational-state.md)

## Context

A Human can ask Tob to create a group of existing PersonaBots or invite another Bot. Losing the response must not cause another group or invitation. Pending approval must not silently adopt changed membership or invitation policy. A management request is distinct from group participation: Tob's protected role remains rooted in the Human DM.

## Decision

Extend the existing application-defined scoped CLI seam through native Shell and the actual ToolExecution context. The accepted Human DM, protected Tob root Orchestrator, ephemeral capability and approval checks from ADR-0224 remain mandatory. Existing Channel and invitation owners perform mutations; no new model-facing management Tool or parallel membership store is introduced.

Generation 98 adds `channel_management_operations` for durable operation receipts to the existing operational database. A stable operation key binds operation kind, normalized payload, target Bot incarnations and reserved Channel or invitation identity. Repeating the same command, key and payload reconciles that identity through its owner; a completed scoped replay is a checked read rather than another mutation approval. Conflicting payloads and unavailable or replaced identities refuse. Reconciliation cannot recreate deleted groups, silently choose another identity or revive an expired Shell capability.

Group creation may have no Bot members. Explicit initial members are added directly, preserving the existing Human/UI creation contract. Later invitations preserve the existing default `botharness-client.autoAcceptGroupInvites=true`. Once the Tob management operation is approved, the invitation owner commits accepted status (`respondedBy=profile-policy`) and membership together, so the invited Bot joins immediately without a separate invitation decision or wake. An existing Human opt-out retains the previous pending-invitation decision flow as a compatibility branch. This slice adds no setting or UI toggle. Tob reports the canonical result and does not override the Human's choice. Protected Tob cannot be an initial member or invitation target.

Scoped invitation carries the opaque fingerprint returned by a Channel read. The fingerprint covers review-relevant metadata, membership and invitation policy, not message journals or unread counters. The reviewed operation also binds the target Bot identity. The Host checks the current snapshot and authority around approval and immediately before mutation. A policy or target change requires another read and proposal, rather than an automatic refresh of approved inputs.

Scoped Channel reads expose bounded metadata without message bodies. Neither reads nor receipt recovery grant membership or make group content an accepted management instruction. Authenticated Human online commands may use the same operation-key and fingerprint inputs; existing unkeyed Human operations keep their owner semantics.

## Consequences

The receipt coordinates recovery; Channel state, invitations and membership remain canonical. The default successful invitation returns accepted status and current membership. For a Profile that opted out, Tob must distinguish a pending invitation from membership. After uncertainty, inspect canonical state or replay the identical operation rather than submit a new key. Current authority is required after restart.

The operational schema migration is forward-only: an older Host cannot open a Profile advanced to generation 98. The creation/invitation slice did not grant group settings or member removal; the follow-up below extends those capabilities. The further follow-up below adds pending invitation cancellation and join decisions. Personal presentation preferences, group deletion and external identity management remain separately delivered scope under #2090. Direct CLI, model-driven execution, Web rendering and macOS Desktop evidence remain separate from this durable decision.

## Follow-up: reviewed group edits and member removal

The next #2090 slice extends the same application-defined Service to group-only rename, avatar set/clear, effective wake-policy read, member wake-policy set/inherit, and member removal. It reuses Channel owners and canonical records without another schema migration, model-facing Tool or UI. Scoped edits require the opaque `expectedChannel` from a current read; authenticated Human commands may opt into it while existing unversioned Human behavior remains compatible.

The snapshot now includes effective member wake policies and whether each is inherited, so a changed Bot default also invalidates a pending proposal. Review captures previous state, proposed values and the exact member identity where applicable. Approval and execution recheck the accepted Human DM, current Human group access, snapshot and target identity. Group-only scope cannot rename a Bot DM. Missing membership or revoked access refuses; protected Tob still cannot join. Member removal preserves the Bot, Memory, other Channels and group history; removing its owner clears Bot ownership and leaves Human management. An archived current member may be removed, while wake-policy changes require an active Bot.

These edits deliberately use compare-and-apply snapshots instead of adding operation receipts: they mutate an existing identity rather than reserve a new one. They accept no operation key. A lost response requires a read of current canonical state; any outstanding change needs a fresh reviewed proposal, never a blind retry or silent replacement of approved inputs. Existing create/invite recovery and default automatic invitation acceptance are unchanged. Source, direct CLI, model-driven approval, Web and macOS verification remain separate evidence categories.

## Follow-up: pending invitation cancellation and join decisions

The same application-defined management Service exposes scoped `group-invite-cancel` and `group-join-decide` through the existing native Shell CLI seam. Both require `expectedChannel` from a current read. Review binds the exact pending invitation/request, decision and target Bot incarnation; execution rechecks current accepted Human DM authority, Human group membership, group fingerprint, target identity and pending status. A concurrent decision or replaced target cannot be silently adopted by an approved operation.

Cancellation cannot undo an accepted invitation or remove an existing member. Default automatic acceptance remains unchanged, so pending invitation cancellation applies only where a pending invitation actually exists. Joining is still committed by the existing Channel owner: acceptance persists membership and decision status, decline does not add a member, and the existing decision notification is recorded once. These actions grant no group participation or authority to Tob and create no new schema, model Tool or receipt.

Scoped operations accept pending records only. Authenticated Human join-decision commands without a fingerprint preserve existing same-decision idempotent readback; this compatibility path does not relax Tob's required review inputs. On an uncertain outcome, read canonical status and membership first, then propose again only if the record remains pending and action is still needed. Cancellation failure never authorizes a fallback member removal. Runtime verification remains separate from this contract.
