# Team mode M5 logic boundary

The application-defined `TeamApprovals` service evaluates current Human status, Bot ownership and Host Role permissions. The existing `approvals.opaqueTools` permission supplies the additional approver role (Owner/Admin by default); membership of a shared Channel alone gives no decision authority. Bot owners can answer their Bot's ordinary questions and secret requests. An opaque DSH tool request from a member-owned Bot additionally requires `approvals.opaqueTools`, including when its own owner decides. An additional approver must be an active member of the request's Channel. The Bot owner can open and decide their own request from Activity without obtaining the rest of that Channel's history.

Approval controllers depend on the narrow `ApprovalAuthority` contract, while shared card types do not import the concrete Host service. This keeps the mobile type graph out of Host subprocess execution.

The canonical request and decision remain Channel messages backed by Source Events. Tool decisions, question resolutions and private-input resolutions persist `decidedBy: { humanId, displayName? }`. Ordinary request fields remain optional on the message wire type. Every projected message and Activity item adds an `approval` property:

```ts
// Non-approver: this is the entire approval value.
{ masked: true, kind: 'tool-approval' | 'user-question' | 'private-input',
  botSlug, state, requestedAt, decidedAt? }

// Approver: the existing request/resolution fields remain present.
{ masked: false, kind, botSlug, state, requestedAt, decidedAt?,
  opaque: boolean, decidedBy?: { humanId, displayName? } }
```

For a masked message, each existing request field (`toolApprovalRequest`, `userQuestionRequest`, `privateInputRequest`) is replaced by the entire masked value above. Resolution fields, body contents, attachments, reply previews and other content are removed; the original message ID, timestamp and placement remain. `body` is empty. A masked Activity item has an empty `summary`. A masked search hit has an empty `snippet`. Status responses retain their existing `status` shape and add `approval`. The CLI name `ask-secret-status` maps to `privateInputStatus`; secret answers use `privateInputSubmit` and `privateInputCancel`. Push data carries the same `approval` metadata and omits content previews and interactive approval categories for masked recipients.

Bridge reads and the native Channel stream project on each response/frame, with no cross-request permission cache. The Activity query uses active Channel membership and effective approval permissions independently of private Bot visibility. If no active approver belongs to the Channel, the Bot owner's Activity includes the canonical request. It reuses its existing item ID and push delivery ledger rather than copying the request or creating a second lifecycle. Grant revocation and Peer/stream disposal remain owned by M1/M3/M9.

Channel message authors expose only `{ kind: 'bot', slug, displayName }` for a known Bot, including private Bots absent from the viewer's Bot list. This applies to message pages, timeline, journal, streams, search and roster previews, with the same `author` on message-backed Activity items and push data. Push `sender` uses that display name. Masked approvals retain this author envelope while withholding their content. The Host selects only the name from the canonical Bot record; persona, prompts, Memory and settings remain private. Inline avatar data is not repeated in these envelopes.

Decision failures are codes: `approval-not-allowed`, or `permission-required` with `details.permission: 'approvals.opaqueTools'` for a member-owned opaque tool. The dangerous Assignment preset refuses non-Owners with `owner-only`; a member Bot refuses dangerous access even when configured by the Host Owner with `permission-required`. The store, Assignment snapshot creation, Session admission and per-tool execution enforce the same restriction. Member Sessions require explicit `ask`, never full access or escalation; delegated Sessions are covered by their durable root owner.

`teamMode` and member creation/invitation responses add `isolation: 'trial' | 'enforced'`. This implementation returns `trial`; M12 owns the transition. The server passes `isolation` to `renderTeamSignInPage`, and the sign-in JSON includes `isolation`. UI text and card rendering are delivered separately by Claude. No database migration is needed: existing permission records and canonical message JSON retain the added facts. Main was generation 145 and the visible parallel M4 branch used 146 when this task started.

Performance impact is on Host projection, not rendering: Bot author names add one indexed lookup per distinct Bot within a response; Human-only ordinary messages perform zero database reads. Repeated copies of the same approval share one lookup within a response, and permissions are refreshed on every response/frame. The M5 regression suite bounds these reads, including 200 repeated messages. Existing resolution expression indexes are reused; no dependency, polling loop or timer is added.
