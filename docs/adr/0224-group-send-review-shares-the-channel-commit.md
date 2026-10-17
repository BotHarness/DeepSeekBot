# ADR-0224: Group send review shares the Channel commit transaction

- Status: Accepted for #2053 with explicit Human quiet-latency exception; #2054 peer-yield extension awaits its own evaluation
- Date: 2026-10-17
- Issue: [#2053](https://github.com/BotHarness/DeepSeekBot/issues/2053)
- Specification: [#2051](https://github.com/BotHarness/DeepSeekBot/issues/2051)

The application-defined Channel owner checks an outgoing Group reply against content actually
returned to its PersonaBot. Comparing a version before an asynchronous append leaves a race;
prompt instructions alone cannot close it. The comparison therefore runs in the same SQLite
transaction that appends the Source Event and Channel placement. Previews remain ephemeral.

The Host issues opaque, expiring observation handles scoped to the Bot, Orchestrator Session
and Group. Direct CLI tool calls use a separate Bot-scoped diagnostic owner. A bounded read
records individual message revisions and content fingerprints, not a high-water mark claiming
that omitted messages were read. A recheck retains the initial range floor. Model tool output
must explicitly carry its returned handle into a subsequent send; concurrently executing a
read does not update another send's default basis. A full inbound message present in the actual
Turn content can supply the initial basis. Metadata and truncated content cannot.

A held result can include a bounded delta of newly changed messages, rendered by the same
model-read projection and output budget as `channel_read`. Only complete returned messages
extend its explicit observation handle; missing or oversized content still requires a read.
This removes an unnecessary model read round without classifying arbitrary Human text as
irrelevant. The next send remains an explicit Bot choice and repeats the atomic checks. A
returned handle never silently updates the default basis of an already running send. Returned
message IDs join the same turn consumption set; the Bot still explicitly resolves completed
Inbox items, preferably together, rather than leaving a redundant cleanup turn. Neither the
read nor a dropped draft resolves work automatically.

A held send persists its identity, owner, original/current draft, basis, expiry and retry count
in the existing Operational Database. It produces no public message or downstream Admission.
One explicit revision or unchanged recheck is allowed. Another change stops the attempt with
`requires-review`. Drop is separate from Inbox resolution. Ten-minute expiry and a different
Host boot fail closed; positive restart recovery belongs to #2056. Purging a Channel source
also clears that Channel's derived send drafts. Revocation, Bot status, Session ownership and
source-content fences remain independent checks at commit.

The rollout is off by default and enabled per local Group through the existing Host bridge
and CLI. Disabling it restores ordinary sends, but an explicit held draft still requires its
review checks. DSH continues owning native Agent lifecycle and Session Persistence; this
decision adds neither a Session manager nor a wake scheduler. Review evidence consumes
canonical history and usage; exported pilot files are process evidence, not message authority.

The durable draft shape and purge integration make this more than a prompt experiment.
Schema generation 97 is additive, following main's generation 96 Tob identity reservation;
roll back behavior by disabling the opt-in before reverting code.
The database generation still requires a compatible binary. Acceptance remains separate from
mechanical regression, real-model outcomes and Human evaluation.

Earlier unmerged pilot Profiles used generation 96 for the review tables. Those private QA
Profiles remain historical QA evidence and must not be opened by the new binary; they are not
a supported upgrade source for the merged migration order. Integration verification uses a fresh Profile
and separately checks the canonical main generation 96 to 97 migration without changing Tob.

The model can explicitly select `resolve_inbox_ids` on the send/drop Tool. The Consumer
first awaits a committed send or successful drop, then calls the existing Inbox triage
Service with those IDs and outcome done. This is opt-in composition of two owners, not
automatic Inbox completion or a new atomic transaction. A resolution failure is returned
separately in `inboxResolution`, preserving the successful delivery identity for safe repair.
Held/refused sends do not resolve anything, and the triage owner still checks observation.

The initiating opted-in Group also supplies a reply-source membership fence for that run.
The Channel Consumer checks it before sending and before effects; losing membership stops
cross-Channel continuation, including a DM fallback. It does not revoke the PersonaBot's
independent DM capability for later requests. Natural-language cancellation remains a model
decision to drop silently, not a Host keyword classifier. Whole-history evaluation checks
all Group/DM outputs so destination changes cannot masquerade as successful silence.

Omitting explicit completion returns `inboxResolution.outcome: not-requested`, so the
Consumer does not imply sending completed Inbox work. Drop shares the send Tool's inbound
Channel default; the existing draft owner/channel check still decides whether it can drop.

For #2054, the same held result identifies fully returned committed peer messages as
`peerMessageIds`. These IDs describe observed content, not semantic completion. The model
compares that content with its remaining responsibility, keeps independent evidence and new
direct questions, and can drop redundant work without an agreement message. A drop may include
`yield_to_message_ids` and its observation handle. The existing owner checks each cited ID
against the current canonical content and the owner's actual observation, excluding Human,
own, failure, purged and preview-only content. It stores the evidence IDs in the existing draft
JSON and returns `explicit-peer-yield`. No database generation or second content store is added.
The trace records the model's deliberate choice, not a Host verdict that all work is complete.
Inbox resolution remains a separate explicit selection, including after a peer yield.
