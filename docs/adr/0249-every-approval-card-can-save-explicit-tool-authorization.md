---
Status: Accepted
Date: 2026-10-24
Issues: [#2730](https://github.com/BotHarness/DeepSeekBot/issues/2730)
---

# Every approval card can save explicit tool authorization

## Context

Browser and Computer authorization, permission-policy changes and Tob's release installation,
restart and Bot deletion cards disabled Always allow. The Human requested the same three actions
for every approval: Allow once, Always allow and Reject.

## Decision

The application-defined Channel Tool Approval owner permits an explicit saved tool rule for these
operations. It still returns DSH's native allowed-once outcome for each authorized call. The same
online CLI command, Web card and phone card submit the existing allowed-always-tool decision.
Secret CLI notifications use the same action category as other rememberable approvals.

Sensitive management and device rules use a separate scope from pre-existing ordinary rules.
Old rules therefore acquire no new authority on upgrade. Generic all-opaque rules cannot approve
these operations; a Human or currently authorized external rule reviewer must select their tool
or exact call. Full Access and the model Approval Reviewer remain separate and cannot create
this opt-in decision. Browser and Computer scopes include their current authorization target.
Changing that scope or revoking a rule restores prompting; the execution fence checks ownership,
scope and current rule authority again before effects.

Tob's broker additionally requires a committed Human decision or a currently matched saved rule,
so a native allowed-once response alone never authorizes its write. Command-specific confirmations,
revision checks and deletion tokens remain in force.

External reviewers still require current approve and save-rules authority, and the Provider must
support confirmed rule cards. A once-only reviewer does not gain permission to write lasting
rules. Unsupported external controls continue to open the authenticated application.

This supersedes the mandatory per-use policy in ADR-0207 and ADR-0239 for Human-saved rules.
Protected MCP service remembering retains its existing independent access checks.

## Consequences

A Human may intentionally authorize later destructive management calls without another card.
Rules remain visible and revocable in the existing rule store; no new database or approval owner
is introduced. A revert stops using the new management/device scopes. Tests must cover saved-rule
reuse, refusal without a committed decision, revoke and changed-target fences.
