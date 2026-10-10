# Lark chat pairing is reviewed authority for the current Binding

[The accepted external-user specification](https://github.com/BotHarness/DeepSeekBot/issues/1371)
requires ordinary chatting without implicitly granting the existing administrator capabilities.
Messaging owns application-defined Roles, the opt-in restricted sender policy and reviewed chat
pairings in its Operational Database. Each Role contains a natural-language behavior policy and
explicit Host-checked management capabilities; the first ordinary-role slice creates an empty
capability set. DSH's native permission and Session ownership remain separate.

A chat pairing identifies one PersonaBot, current authenticated App Binding/fingerprint and
Provider-authenticated Lark open ID. It can qualify the same person across permitted conversations
in that scope. It never transfers across Bots, Apps, platforms, unbinding/rebinding or restored
Profiles. A conversation's reception/block policy and the exclusive qualified Provider Consumer
remain additional gates. Existing `/pair` records retain their explicit management purpose and
capabilities; neither kind implicitly establishes the other.

Restricted unpaired DMs and mentions become bounded pending requests before message persistence
or Inbox Admission. The request stores trusted routing/actor metadata and bounded message IDs,
never the original instruction or attachment content. It creates no request Admission, wake, Task
or model call. Approval checks the current request and Role revisions and commits the decision
before sending a fixed re-ask notice; there is no replay of the blocked request. Only a new valid
message can enter the existing intake path. Host admission is checked again at consumption.
Each author's compact trusted Bot/App/actor/source references are separate from untrusted text;
role text and permission snapshots are not automatically injected into Inbox turns or system prompts.
The read-only `bridge_sender_permissions` Tool resolves an accessible canonical Source Event
through the Messaging owner and reads the current Binding, pairing, Role and policy revision,
returning a query time and explicit unavailable/unpaired/revoked status where appropriate. It
does not approve anyone, mark an Admission observed or authorize acting as the queried person.
Stable behavior guidance asks the model to refresh this lookup for the actual requester of a
new permission-sensitive operation and defer that operation if identity or lookup is unresolved;
ordinary chatting need not call it. Historical Tool Results are dated evidence, not live authority.
Different authors' permissions are never combined. Natural-language restrictions are prompt behavior policy, not enforced
access controls for mail, code or arbitrary Shell resources.

The 2026-10-11 confirmed specification revision replaces the earlier automatic current-Role
injection design with this on-demand lookup. Deterministic admission and supported Host management
checks remain independent of model compliance. No full per-message directory or permission cache
is introduced, and a query of an old accessible source still reads current canonical state.

Control notices use the existing checked Provider reply capability, fenced by current
Binding/Consumer/actor route and request revision. A pending notice is scheduled after the intake
callback returns because the Provider serializes that callback with account transitions. Durable,
bounded attempt metadata is committed before the external request; an uncertain result remains
unconfirmed and is never blindly resent on restart. Notice failure cannot undo approval or admit
old text. Ordinary model replies retain the existing Source Event/Outbox path. Revocation removes
future eligibility and invalidates queued unauthorized Admissions without rewriting history.

We rejected extending administrator `/pair` grants into implicit chat eligibility, conversation-wide
identity grants and approval-time replay: each conflates independent authorities or preserves an
instruction before its sender is eligible. Configuration stays in the Bot DM Channel sidebar;
Profile remains a shareable identity. Role editing/reassignment
and explicit open-group passive context follow the Human gates in
[#1374](https://github.com/BotHarness/DeepSeekBot/issues/1374),
[#1375](https://github.com/BotHarness/DeepSeekBot/issues/1375) and
[#1376](https://github.com/BotHarness/DeepSeekBot/issues/1376).

## Read-only directories

The #1374 slice adds `bridge_directory` at the existing Orchestrator capability seam, with
three bounded/pageable views owned by Messaging: current effective ordinary paired people and
Roles; known/configured external conversations and their states; and paired people observed in
the conversation anchored by an accessible canonical Source Event. Directory reads do not
approve, assign, change reception policy, mark Admissions observed, or authorize new targets.
They are requested Tool Results, not an automatically injected directory or permission cache.
The actual requester of a new role-governed question still needs the #1373 current-permission
lookup; a listed person's Role cannot authorize impersonation.

Observation reads use current authorized retained-source access, including joined shared
placements rather than only original source ownership, and intersect it with current pairing in
the exact Bot/App/Binding namespace. Unbinding/rebinding does not inherit old observations.
Each query examines at most 1000 recent matching retained Source Events, reports truncation and
observation times, and excludes content made inaccessible by purge or current membership.
The view is always incomplete and never a complete or current platform membership list: silent
or departed members and platform reach cannot be inferred. A known configured target is not a
new send authorization. Pages re-read current authority; cursors are query-scoped, short-lived
continuation positions, not snapshots or capabilities. Group answers remain visible to the whole
group. The complete first-flow Human feedback in #1374 remains the gate for #1375 and #1376.

This appends Operational Database generation 78. Back up before upgrade; an older writer cannot
reopen the upgraded Profile. Rollback needs the matching pre-upgrade backup or forward repair.
Real Lark qualification uses a reusable independent test App and isolated Host with a freshly
coordinated exclusive receiver window; a previously saved idle confirmation is not a lease.

## Current Role changes and private management decisions

The #1375 slice edits a Role's name, behavior and explicitly selected `approve`/`reject`
capabilities, or reassigns one approved person to one current Role, through revision-checked
authenticated sidebar commands. Empty capabilities remain valid; `answer` and `save-rules`
are not offered as implemented Role actions. A successful mutation advances the policy revision;
Role edits advance the Role revision and reassignment advances the pairing revision. Queries in
the same native Session read current authority while prior Tool Results remain unchanged.

The qualified private approval route may select either a legacy explicit management pairing or
an approved ordinary pairing originating in a DM whose current Role has the relevant capability.
The existing route's verified private origin remains required; a group pairing does not create a
private or group management destination. Delivery and decision checks re-read current Role
capabilities rather than copying them into a standing grant. The exact selected pairing, current
Binding, actual authenticated actor, destination/receipt, native request lifetime and offered
operation remain independent fences. Reassignment invalidates older route revisions; capability
removal refuses a delayed card and invalidates its yet-unused approval. Existing legacy grants
keep their explicit capabilities and do not establish ordinary conversation eligibility.

No mutation rewrites model history or claims to interrupt an already running arbitrary Shell
operation. Role text remains prompt behavior, while supported control decisions are Host checked.
The one-time reviewed pairing-code proposal remains a future extension until its issuance and
reviewer command contract is specified; public request references remain non-authorizing locators.
