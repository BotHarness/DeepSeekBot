# ADR-0168: External groups are current scoped management authority

Date: 2026-10-11
Status: Accepted
Issues: [#1392](https://github.com/BotHarness/DeepSeekBot/issues/1392), [#1406](https://github.com/BotHarness/DeepSeekBot/issues/1406)

## Context

The Human approved continuing group authorization after reviewing AWS IAM practice.
[AWS groups](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html) retain policies and
support multiple memberships; [policy evaluation](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
combines applicable allows with explicit deny precedence. BotHarness adopts those principles for
its supported management capabilities. Its External User Role remains a behavior policy with
optional capabilities, distinct from an [assumable AWS role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html).

## Decision

Messaging owns application-defined External Authorization Groups in the Operational Database.
Each group is bounded to one PersonaBot and exact current App Binding, has revision-checked
Allow/Deny and members, and may coexist with other groups. Each member is the ID of an approved
ordinary Chat pairing, rather than a platform actor ID. Revocation, new pairing or replacement
Binding cannot transfer membership or person exceptions. Disabled Bindings contribute nothing.
The first tracer exposes only approve/reject; existing legacy grants retain their stored actions.

Each person retains one primary behavior Role. At query and actual private native approval
decision time, the owner reads canonical current Role, applicable groups, legacy management grants
and person exceptions. The effective set is their Allow union minus any explicit Deny.
No Allow defaults to refusal; removing a group removes only its contribution. The resolver
returns source identity, kind, name and revision as dated read evidence. Historical Tool Results
remain unchanged. Natural-language policies are prompt behavior, not arbitrary resource ACLs.

Groups and exceptions never approve Chat pairing or mint a private management destination.
The existing actual actor, Binding, selected pairing/revision, private origin, receipt, native
request lifetime and operation fences remain independent. Current Deny or removed Allow refuses
a delayed card and its unused execution approval; running arbitrary Shell is not interrupted.
Authenticated direct Web Human input keeps default complete product authority and needs no IM
setup or prompts. External text displayed in Web retains its external provenance; native
execution approvals remain required.

The Client adds a searchable/sortable Groups table, separate create/edit dialog, scoped member
checkboxes and compact dates to existing pairing settings. People details show effective sources
and a separate personal-exception editor. Supporting explanations stay behind information icons.
Commands reuse the authenticated API Gateway/Client senderAccess seam; no second Consumer,
permission cache, database or native DSH RBAC is introduced.

Generation 79 adds one group table without rewriting existing grants or pairings; groups and
exceptions begin empty. Back up before upgrade. An older writer cannot reopen the upgraded
Profile: rollback requires the pre-upgrade backup or compatible forward repair. Groups are
limited to 50 per Bot and 100 member IDs per group, with bounded supported action choices.

## Alternatives and consequences

Batch-copying a Role was rejected because membership removal would not withdraw its contribution.
Unioning natural-language Roles was rejected because conflicting behavior text has no deterministic
permission algebra. A complete IAM policy language, nested groups, resource policies, boundaries,
temporary role sessions and delegated group management remain separate work.

This first tracer requires actual Lark/private native approval evidence and Human feedback before
expanding providers or new management actions. Reusable QA Apps still require a fresh exclusive
receiver window and an isolated Host. One-time pairing codes remain tracked separately in #1404.
