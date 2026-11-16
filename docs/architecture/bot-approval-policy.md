# Bot approval policy

Status: Human-confirmed design, 2026-11-15. This document records design and implementation boundaries; GitHub issues own delivery status. Documentation changes no runtime settings. [中文](bot-approval-policy.zh.md).

[ADR-0342](../adr/0342-bot-approval-selects-one-template-and-keeps-deterministic-authorization-separate.md) owns the durable choices and trade-offs. This document owns the integrated target behavior. GitHub issues own delivery status. Neither this interview nor these documents authorize implementation, live permission changes or a SQLite migration.

The implementation keeps template files and global selection in the existing file owner, Bot choices in the Bot Registry, card authorizations in the Tool Approval Rule owner, and decisions in Channel Tool Approval. Slices #4205, #4211, #4244, #4245, #4246, #4210 and #4212 cover declarations, selection, three-part editing, rule management, confirmed deletion and shared CLI/native admission. Delivery evidence is source-qualified; iOS and outstanding matched-performance checks remain in [QA #2742](https://github.com/BotHarness/DeepSeekBot/issues/2742#issuecomment-6909957258).

## One effective template

The Profile has an optional global default selected from its shared Approval Template library. Each Bot chooses exactly one mode:

| Choice            | Effective Reviewer policy                                         |
| ----------------- | ----------------------------------------------------------------- |
| Inherit global    | The currently selected global template; no copy or extra Bot rows |
| Specific template | That shared template, replacing the global template completely    |
| Off               | No template Reviewer                                              |

Several Bots can select the same template. A global selection change reaches inheriting Bots; editing a shared template reaches every Bot whose effective selection uses it. Neither change modifies a Bot using another specific template or Off. A global default of none disables the Reviewer only for inheriting Bots.

Disabling the Reviewer does not revoke deterministic rules or change Full Access.

New Bots default to inheritance. Existing Bots retain their previous specific template or Off; an absent legacy field must not silently become opt-in. This fixes compatibility semantics, not a persistence format or migration plan.

## Natural-language policy and Reviewer outcomes

Every template contains individual natural-language Always ask rows, individual natural-language Always allow rows, and free text. These describe behavior for the Reviewer, rather than command regexes or deterministic predicates.

The Reviewer is instructed to give Always ask precedence over Always allow. Free text supplements the policy without cancelling requirements from those sections. An unclear overlap, uncovered behavior or uncertainty produces ask-human. Interpretation can be wrong; the section names provide no hard guarantee that every matching real-world action will be recognized.

There are only two model outcomes:

- allow: approve this request once, without creating a standing rule;
- ask-human: present the Human approval card, where the Human can approve or reject.

The target removes autonomous model reject. Consequently, the current model-rejection counters and rejection-triggered pause/resume mechanism do not apply. Existing historical decisions are implementation evidence, not proof that this target has shipped.

## Deterministic authorization and effect admission

The target first uses deterministic code to determine whether the action needs approval and resolve valid deterministic authorization. A covered request does not incur a model call. An uncovered request uses the effective Reviewer policy or goes to the Human when the Reviewer is disabled.

Implementation slice #4210 routes trusted irreversible external effects through the common approval owner even under Full Access. Deterministic rules resolve before the Reviewer; approval records capture the declared effects for presentation. Management keeps ADR-0249’s dedicated scope. Full Access does not by itself waive the external-effect approval specified in [E2 #4210](https://github.com/BotHarness/DeepSeekBot/issues/4210). The concrete effect declarations and admission mechanism remain in [E1 #4205](https://github.com/BotHarness/DeepSeekBot/issues/4205), E2 and [E4 #4212](https://github.com/BotHarness/DeepSeekBot/issues/4212). No claim is made that arbitrary behavior can be inferred reliably from a command string.

Card-created Tool Approval Rules remain deterministic, Bot-scoped authorizations with their existing role, authority scope and execution checks. The Bot permissions table shows their source such as “From approval card”, role, scope and revoke action. This separate display does not turn them into the template editor's natural-language Always allow rows. They are not written into the shared template, granted to other Bots using it, or included in template copies. A natural-language row cannot override an already matched deterministic rule; the Human must revoke that rule to return those requests to review.

Current ownership, Workspace Grant, device-target and rule-revocation checks remain independent of model permission. Effective policy management skips the model Reviewer and Full Access, but may use an explicitly saved authorization covering that management operation under ADR-0249. Existing ordinary rules do not gain management authority. Management approval identifies affected Bots.

## Creation, editing and deletion

Creation explicitly offers starting blank or creating from an explicitly selected existing template. A copy is independent, without a continuing link to its source. Saving explicitly offers “Save only” and “Save and use for this Bot”; creation alone does not change a Bot's selection. Editing the shared original and creating a new template must be explicit choices; no implicit copy or shared edit is inferred from the current Bot page.

Deleting a referenced template uses a second confirmation listing affected Bots and the resulting effective selection. The user does not need to detach each Bot:

| Reference                                     | Confirmed deletion result                                                |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Bot specifically selects the deleted template | Change that Bot to inherit global                                        |
| Global selects the deleted template           | Clear the global selection                                               |
| Bot inherits global                           | Keep inheritance; if the global default was deleted, no Reviewer remains |
| Bot selects another template or Off           | Keep its choice                                                          |

If the global default is another template, Bots falling back to inheritance use that template. Confirmation must disclose that result, not merely say the deleted template will be removed. Deterministic rules and Full Access are not revoked or changed by this operation.

The application-defined deletion workflow composes the existing template-file owner and Bot Registry. The authenticated Host provides a read-only impact preview and rechecks its revision before confirmed deletion. The revision includes the template, remaining global policy and complete reference set. Visible Bot identities and a count of protected private references disclose the impact without opening another Human's private Bots. A stale preview is refreshed for another explicit confirmation; a missing template or unreadable global selection refuses deletion rather than applying fallback. An existing unreadable custom file can be removed by an explicitly confirmed CLI recovery preview marked `contentUnavailable`; that revision binds bounded filesystem identity (device/inode, size and timestamps), not a full content hash. Readable-template revisions remain content-bound, and changed identity or repaired content requires another preview. Reviewer content-read limits are unchanged. File deletion failure attempts to restore the preceding choices and reports incomplete restoration explicitly. No new persistence authority or database migration is introduced.

## Review snapshots and failures

Each Review captures its template identity, version and content when it begins. Edits and selection changes affect later Reviews; already-started Reviews may finish using their captured version. Review records retain that identity/version. This is policy-version consistency, not an exception to current authorization and execution fences.

Missing or unreadable selected templates, unavailable models, timeouts and malformed Reviewer replies all route the current request to the Human with the reason. They do not select another template, allow silently, or rewrite Bot/global choices. A deliberately empty global selection is not a load failure. A confirmed deletion's fallback is an explicit management action, not an error-recovery fallback.

## Existing specifications and implementation

The source baseline inspected was fc29d448467392b1e9ed2f3d048d3d1df0b14381. These are static observations, not a live-Host verification:

| Aspect              | Existing fact or specification                                                          | Confirmed target                                                                    |
| ------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Selection           | Single optional Bot field; no global default in plugin.ts:2491                          | Global inheritance, specific selection or Off                                       |
| Policy shape        | ADR-0207 specifies whole Markdown; #4203 and E3 specify three parts plus Bot extra rows | Three parts in one selected template; no extra Bot layer                            |
| Reviewer output     | approval-reviewer.ts:189 has allow/reject/ask-human                                     | allow/ask-human only                                                                |
| Rule precedence     | tool-approval.ts:306–349 resolves Full Access and saved rules before Reviewer           | Keep deterministic authorization first; retain E2's changed effect admission target |
| Card rules          | #4203 and E3 AC-3 retain deterministic execution and source labels                      | Preserve that requirement and Bot ownership                                         |
| Referenced deletion | Previously unresolved in this interview                                                 | Confirm once, disclose effects and fall back to inheritance                         |

Source files: [Bot record](../../packages/core/src/bots/persona-bot.ts), [template lookup](../../packages/core/src/plugin.ts), [Reviewer](../../packages/core/src/workspaces/approval-reviewer.ts), [approval owner](../../packages/core/src/workspaces/tool-approval.ts), [rules](../../packages/core/src/workspaces/tool-approval-rules.ts). ADR-0205/0207/0239/0249 explain the historical evolution; ADR-0207 alone is not the current complete pipeline.

On 2026-11-15, [#4203](https://github.com/BotHarness/DeepSeekBot/issues/4203), E1, E2, [E3 #4211](https://github.com/BotHarness/DeepSeekBot/issues/4211) and E4 were open, unassigned, with zero comments. No claim or new-scope implementation PR was found in the checked evidence; this does not prove no implementation exists. The local gh CLI lacked authentication, so timeline completeness was not established. Existing template/Reviewer and card-rule capabilities have merged predecessors, including PRs #1835 and #2739. No issue or comment was created or edited during the interview.

This target modifies #4203/E3's selection composition and the existing Reviewer outcome contract, preserves the three-part editor and deterministic source-labelled card rules, and retains the E2 direction. Reconciliation belongs in those existing issues; no duplicate issue is needed. SQLite migration #4227 is outside this design. Performance PR #4228 is unrelated and was not modified or monitored.

## Research boundary

The inspected project .claude/settings.json contains only allow entries for Bash(pnpm evidence:publish:_) and Bash(pnpm evidence:check:_); it contains no ask, deny, hooks or defaultMode. This is project-file evidence, not an audit of the effective user/managed/runtime settings. No secrets were printed.

The official Claude Code [permissions documentation](https://code.claude.com/docs/en/permissions.md#manage-permissions), read on 2026-11-15, distinguishes enforced permission configuration from natural-language guidance, evaluates deny before ask before allow, and describes Bash wildcard patterns rather than regexes. [Memory guidance](https://code.claude.com/docs/en/memory.md#claude-md-vs-auto-memory) describes CLAUDE.md as context. [Auto-mode configuration](https://code.claude.com/docs/en/auto-mode-config.md) documents natural-language hard_deny, soft_deny and allow, separately from deterministic permissions and shell-allow handling. Those field names and Claude-specific precedence are research evidence, not BotHarness APIs or guarantees. Engine source and effective runtime settings were not audited.

## Interview decision trace

- Q1–Q3: replacement rather than layering; three Bot choices; natural-language Reviewer guidance.
- Q4–Q7: reusable shared templates; two model outcomes; deterministic rules first; empty global selection disables inherited review.
- Q8–Q10: natural-language precedence; E2 effect admission despite Full Access; fixed template versions per Review.
- Q11–Q13: failure routes to Human; Bot-owned card rules; existing management-authority boundary.
- Q14 and its follow-up: the Human replaced implicit copy/customization with explicit blank-or-copy creation and explicit save-only versus save-and-apply.
- Q15: the Human replaced deletion refusal with one second confirmation and disclosed bulk fallback to inheritance.
- Q16–Q18: preserve existing Bot choices; no standing rules from model allow; clear the global selection when its default is deleted.
- Final confirmation: the Human accepted the complete summary before any design documentation was written.

## Interview delivery boundary (historical, 2026-11-15)

The User confirmed the design after questions Q1–Q18 and a complete summary. There are no outstanding product decisions in that interview tree. Implementation mechanics, CLI contracts, storage/version representation and migration were left to implementation tasks at that time, rather than silently selected by the interview. Current implementation facts follow below; SQLite migration remains separate. The existing application-defined approval owner remains the owner; DSH-native approval/request, Session and API Gateway seams are not replaced by a second authority.

The interview recorded these delivery requirements: demonstrate inherited versus specific/Off behavior, Reviewer conflict/uncertainty routing, deterministic bypass without an LLM call, Bot-only card-rule scope, disclosed deletion fallback, captured policy versions, failure routing and management refusal without valid authority. Their source-qualified evidence and outstanding checks live in the implementation issues and QA #2742; the historical interview itself proves no runtime or test result.

Performance assessment: documentation-only edits introduce no dependency and change no runtime hot path, so no runtime benchmark is warranted for those edits. This exemption does not cover feature implementation. Added admission work and model calls require separate budgets, deterministic hits must make no Reviewer call, and real-journey verification follows the repository's performance policy. Outstanding matched comparisons remain in QA #2742.

## Current implementation boundaries

The #4244 editor retains the template-file owner and 32 KiB bounded reads. ADR-0342 records the v1 content representation; legacy Markdown maps intact to free text. Copies contain only content. Save and apply are separate choices, shared-original editing shows global inheritors among actual users, and content edits affect future Reviews.

Direct CLI effect calls use an owned native execution Session with the existing `direct-` identity prefix. Ownership resolves for admission and audit, but these one-call executions are excluded from persistent Bot root enumeration: they must not become the current chat Orchestrator or cause report delivery to wake a model. The native Agent is disposed after the call; ownership and execution evidence remain.

## Human approval result presentation

A Reviewer handoff appends an explicit `ask-human` result to the canonical Channel before the Human request, with its captured template identity/version, sanitized input and reason. Record failure still routes to Human; cancellation and owner changes cannot grant authorization. Historical autonomous rejection records remain readable; the historical rejection override cannot accept an `ask-human` record.

The Web and mobile Human approval card keeps its full request content after Allow once, Always allow or Reject. Only the operation area becomes the selected, disabled result. Open details remain open across a decision, and historical cards retain the original content on reload. Mobile projects validated display-only request content from the existing Channel message, without per-card history/status reads; cached content never authorizes a decision. Missing or malformed historical content is shown as unavailable.

Typed Tob command preparation must provide a review proposal whenever the shared declaration requires approval. A completed operation receipt is explicitly read back without starting the effect again; caller-supplied completion claims cannot select that path.

Tool approval requests and Reviewer records for an Orchestrator stay in the actual originating DM or Group. A participant DM never falls back to the principal’s legacy DM. An unavailable or mismatched origin refuses review and card creation; this does not grant the participant any approval permission. Existing approver and audience checks still control visibility and decisions.

Authenticated direct `bot-tool` requests bind their transient native execution to the calling Human’s DM, before dispatch, and remove that binding when the call settles. Tool targets and historical Channel placements do not select the approval recipient. A missing calling context does not fall back to another Human.
