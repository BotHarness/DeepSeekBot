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
Profile remains a shareable identity. The three read-only directories, Role editing/reassignment
and explicit open-group passive context remain later slices with the Human gates in
[#1374](https://github.com/BotHarness/DeepSeekBot/issues/1374),
[#1375](https://github.com/BotHarness/DeepSeekBot/issues/1375) and
[#1376](https://github.com/BotHarness/DeepSeekBot/issues/1376).

This appends Operational Database generation 78. Back up before upgrade; an older writer cannot
reopen the upgraded Profile. Rollback needs the matching pre-upgrade backup or forward repair.
Real Lark qualification uses a reusable independent test App and isolated Host with a freshly
coordinated exclusive receiver window; a previously saved idle confirmation is not a lease.
