---
Status: Accepted
Date: 2026-09-20
---

# Orchestrator manages Assignments through a durable directory

The Orchestrator manages every independent Assignment Session owned by its PersonaBot through an **Assignment Directory**. An Assignment Session's DSH Session id is its canonical identity; BotHarness does not add a second `assignmentId`, while Continuity Key remains an optional PersonaBot-local alias. The directory is a durable read model over BotHarness Session Ownership plus DSH Session events, projections, and cold-query facts. It exposes purpose, Continuity Key, Workspace, requested model and dependencies, DSH-derived `activity` and `lastRun` facts, the latest semantic Assignment Report, and aggregate descendant activity. Execution activity and a reported outcome remain separate fields rather than one BotHarness `AssignmentStatus`. The directory is not a new Task entity or lifecycle, and it is never reconstructed from cwd, title similarity, recency, live AgentHandles, or whatever the current Orchestrator context happens to remember.

`list_assignments` defaults to the current-attention view: active, blocked, waiting-human, and terminal results not yet observed by the Orchestrator. It uses opaque cursor pagination and defaults to `updatedAt DESC` with canonical Session id as the deterministic tie-breaker. `updatedAt` advances only when a Directory-visible fact changes. The query accepts explicit filters, sort field and direction, bounded page size, and cursor; inactive/history rows require an explicit filter. Cursors belong to the exact filter and ordering that produced them rather than serving as durable Assignment identity.

A Host-lifetime Assignment Runtime owns live AgentHandles for Assignment Sessions and exposes five narrow semantic tools to the Orchestrator: `list_assignments`, `inspect_assignment`, `create_assignment`, `send_assignment_request`, and `stop_assignment`. Sending a waking request to a compatible idle Assignment Session is the resume operation, so there is no separate `resume_assignment` tool. DSH `ctx.agents.create()` creates a fresh independent root with no Orchestrator parent; `resume()`, `followup()`, `steer()`, `inject()`, `cancel()`, and `whenIdle()` remain internal delivery and lifecycle primitives. Each tool resolves PersonaBot ownership and capability before touching a handle, so the model cannot address an arbitrary Session id or another PersonaBot's Assignments.

The Orchestrator may autonomously request an Assignment Session when its admitted request is within the PersonaBot's authorized Workspace, model, tool, dependency, and resource constraints. The Assignment Runtime atomically checks the profile-wide Assignment concurrency limit and reserves capacity by recording a minimal **Assignment Delivery Intent** with a stable dispatch id, causation, dispatch reason, requested purpose, ownership provenance, and optional Continuity Key. It immediately carries that id in the initial DSH Session content, creates the root, and binds its explicit ownership. A request rejected at the limit creates no intent or DSH Session. Permission to create local work never implies permission for provider Service Actions, which continue to require their own Service Grants.

Assignment reuse is explicit. The Orchestrator may address an exact owned Session id, or resolve a Continuity Key that uniquely names one owned Assignment Session whose Workspace mapping, model, and dependency requirements still match. An Assignment Session whose latest run completed but remains idle and resumable may receive a new turn after concurrency admission; cancelled or Archived Assignment Sessions, and Assignment Sessions marked `needs-repair`, never resume automatically. A Continuity Key names at most one resumable Assignment Session within its PersonaBot. Its active holder must first become idle/completed or be explicitly stopped and superseded before the key moves to a replacement. Otherwise the Orchestrator creates a new Assignment Session or asks for Human resolution. It never selects a Session by cwd, recent activity, title or prompt similarity, and it never appends unrelated work merely because a Session is live.

An addressed Assignment Request lets the Orchestrator manage work already in progress. For a question such as “X 资料怎么样了？”, it can inspect the directory's current facts and, when a semantic update is needed, send the exact X Assignment Session a correlated progress request. The Assignment Session returns progress or results through `report_to_orchestrator`, which commits one durable Session-origin **Assignment Report** Source Event and Inbox Admission for the owning PersonaBot. The report carries a concise summary, result state, causation/correlation, and artifact references; full reasoning, tool traffic, and execution history remain exclusively in DSH SessionPersistence.

SQLite and DSH SessionPersistence cannot commit atomically, so creation and Assignment Request delivery use the same deliberately small crash-consistency pattern. The Assignment Runtime records one Assignment Delivery Intent with a stable id before crossing into DSH; the DSH content carries that id and the receiver accepts it idempotently. On restart, the Assignment Runtime performs bounded reconciliation against DSH facts: unique evidence completes the binding or delivery, proven absence permits delivery, and unresolved ambiguity becomes `needs-repair`. This is at-least-once transport with idempotent acceptance, not distributed exactly-once. The Assignment Runtime does not add a general workflow engine, background retry scheduler, or elaborate quarantine lifecycle for speculative edge cases.

Assignment Runtime exposes semantic Assignment Request modes rather than raw AgentHandle methods. `context-update` contributes durable context without waking the Assignment Agent and maps to DSH `inject`; `next-step` asks for progress or adjusts the active line of work at the next safe step and maps to `steer`; `next-turn` queues a continuation after the current turn and maps to `followup`. Ordinary requests never cancel a tool or model step already in flight. Only the runtime chooses the concrete DSH primitive after rechecking ownership and liveness.

Concurrency admission also applies when an Assignment Request would wake an idle Assignment Session. `context-update` does not wake execution and therefore needs no capacity; `next-step` and `next-turn` must obtain capacity when their target is idle. Sending another request to an already active Assignment Session does not consume a second slot. Create and wake calls share one serialized Assignment Runtime admission point so concurrent callers cannot both claim the final slot.

When a Human asks about ongoing work, the Orchestrator decides how to answer from the truthful information available. It may answer directly from current Directory facts, wait within its current bounded turn budget for a correlated Assignment Report, or tell the Human that work is still running and that an update has been requested. The Host never forces an indefinite wait and never invents semantic progress. A late report remains useful because it enters the Bot Inbox and can drive a later response.

BotHarness does not inject an Assignment Directory summary into every Orchestrator turn. (Amended by ADR-0354: a bounded, change-only Host work context listing active Workspace Grants and unarchived Assignments may accompany an Orchestrator turn.) Instead it follows the useful communication shape of DSH continuable subagents: creation returns an addressed durable identity, the managed Agent can send meaningful reports, and the runtime can deliver a distinct settlement notice. For independent Assignment Sessions, `ctx.assignments` implements this shape through Assignment Requests, Assignment Reports, and Host-origin **Assignment Lifecycle Notices**; it does not call `ctx.subagents.sendMessage()` or claim DSH parent/child lineage. An Assignment-authored report and a runtime account of settlement keep distinct provenance, so the Orchestrator never attributes Host text to the Assignment Agent. A notice is emitted only for meaningful boundaries such as settled, error, or cancellation and carries a concise safe summary plus related report or artifact references when available, not every running/idle fluctuation. The Orchestrator calls the Assignment Directory when it needs a fresh inventory or details.

Top-level Assignment control tools are available only to the current Orchestrator. An Assignment Agent receives `report_to_orchestrator` but cannot list, create, address, or stop peer Assignments; its DSH Subagents do not receive that reporting tool by default and communicate with their direct Assignment Session parent through native subagent messaging. The Assignment Directory never flattens those descendants into independent Assignment rows. `inspect_assignment` may expose aggregate facts such as `hasActiveDescendants` and `activeDescendantCount` for diagnosis and stop/archive convergence, but the Orchestrator cannot address a descendant directly.

Assignment control belongs to the PersonaBot, not to the particular Orchestrator Session incarnation that created an Assignment Session. After an Orchestrator restart or replacement, the PersonaBot's current Orchestrator can list, query, message, resume, or stop its owned Assignments through the same ownership checks. Assignment Reports and Lifecycle Notices resolve the owning PersonaBot's current Inbox at delivery time rather than retaining a stale Orchestrator Session destination.

Assignment Reports are both responsive and proactive. An Assignment Session reports a meaningful milestone, a useful intermediate result, transition to blocked or waiting-human, and terminal outcome without waiting for a poll. Every report remains an immutable Source Event. Before the Orchestrator observes them, repeated reports for the same Assignment/correlation may share one Attention Unit that shows the latest summary and repeat count; after observation, a later meaningful milestone, blocked/waiting transition, or terminal result creates new attention. Tool-step and heartbeat-like noise is not reported.

Assignment Reports and Assignment Lifecycle Notices use the same Bot Inbox Trigger and Wake Policy as other internal Source Events rather than a second Assignment-only scheduler. Correlated responses, blocked, waiting-human, error, cancellation, and terminal results default to `immediate`; ordinary milestones default to `digest`. Human-configured Trigger and Wake Policy may change those defaults. A matching terminal report and lifecycle notice remain distinct Source Events with distinct provenance but share one Attention Unit and cause at most one wake. If no terminal report exists, the lifecycle notice independently supplies terminal attention.

The Orchestrator may stop one of its owned Assignment Sessions when the Human asks, the dispatch is superseded or duplicated, a resource budget is exhausted, permission is revoked, or safety policy requires it. In one BotHarness transaction, the Assignment Runtime records the reason, closes admission of new Assignment Requests, and supersedes undelivered intents before requesting graceful stop; it uses DSH `cancel` only after the bounded stop deadline. A late already-delivered request or report remains audit evidence but cannot reopen or wake the stopped Assignment Session. Cancellation preserves Session history and artifacts, never implies purge, and cannot erase or assume the outcome of an already issued external request.

Completed and cancelled Assignments remain queryable in the Assignment Directory for as long as their DSH Session and ownership facts are retained. Default queries and UI may collapse inactive history, but BotHarness does not automatically delete it on a timer. Permanent removal remains the explicit purge path.

V1 has one profile-wide **Assignment Concurrency Limit**, configured only by the Human in the BotHarness section of the global DSH Settings modal. It defaults to `3` and accepts `1–32`; there is no unlimited value or per-PersonaBot override hierarchy, and the Orchestrator may read but not change it. Only independent Assignment Sessions actively executing a turn, model call, or tool call consume capacity; idle, waiting-human, blocked, and completed Assignment Sessions, the Orchestrator Session, and DSH Subagents do not. DSH remains responsible for its own lower-level Agent and Subagent resource controls. Lowering the BotHarness limit never cancels existing work, but new create or idle-wake attempts fail until active use falls below it.

The Assignment Runtime does not maintain a concurrency waiting queue. When a create or idle-wake tool call reaches the limit, it immediately returns a structured result containing a stable error code, `activeCount`, `limit`, `retryable: true`, and a concise LLM-readable `message`. The message states that the global limit was reached, that no Assignment Session was created or awakened, and that the Orchestrator may wait for active Assignments to finish or ask the Human to change the setting. It does not invent a queue position or completion time. The Orchestrator may explain the constraint or make a later tool call based on new information, but the Host does not persist, reorder, retry, or restart a rejected dispatch automatically. This limit is a Host-enforced resource boundary rather than prompt guidance.

Assignment Sessions do not communicate directly in v1. An Assignment Session reports a coordination need to the Orchestrator; the Orchestrator resolves the target through its Assignment Directory and sends a new correlated Assignment Request. This keeps one ownership, routing, loop-control, and audit path instead of creating a peer Session bus.

## Considered Options

- **Let the Orchestrator remember its workers only in model context** — rejected: compaction, restart, cold Orchestrator periods, and concurrent updates would lose or stale the inventory.
- **Expose the live AgentHandle map directly to the Orchestrator** — rejected: handles are process-local lifecycle capabilities, not durable identity or a safe model interface.
- **Reuse the most recent Session or nearest cwd automatically** — rejected: several Assignment Sessions may share a Workspace and unrelated tasks may be active concurrently.
- **Represent every Assignment Session as a Task entity with its own status lifecycle** — rejected: ownership metadata and DSH-derived Session state already provide the required facts.
- **Make Assignment reports ephemeral direct Agent messages** — rejected: reports would be lost while the Orchestrator is cold, compacted, restarting, or busy in another turn.
- **Let Assignment Sessions reply directly to Channels** — rejected: ADR-0036 keeps the Orchestrator as the PersonaBot's single social voice.
- **Require Human confirmation for every local Assignment creation** — rejected: the Orchestrator is the PersonaBot's control plane and may delegate within already authorized local constraints.
- **Expose raw `inject` / `steer` / `followup` selection to the model** — rejected: The Assignment Runtime owns the delivery contract and chooses the DSH primitive from semantic request intent and current liveness.
- **Interrupt the active Assignment Agent step for every Orchestrator message** — rejected: ordinary status questions and context updates must not cancel an in-flight tool or model request.
- **Block the Human-facing Orchestrator turn until Assignment replies** — rejected: the Orchestrator can answer from known facts or explain that it requested an update; late reports remain durable.
- **Require the Orchestrator to poll every Assignment Session** — rejected: meaningful milestone, blocked/waiting, and terminal reports are proactive and durable.
- **Forbid the Orchestrator from stopping work it created** — rejected: the control plane must be able to converge superseded, duplicate, over-budget, unauthorized, or unsafe work without deleting its history.
- **Allow direct Assignment-to-Assignment messaging with an audit copy** — rejected for v1: mediation through the Orchestrator preserves one routing and control plane and avoids a second peer bus.
- **Ignore the SQLite/DSH crash window** — rejected: a Host crash must not silently lose a request or create an unowned duplicate Assignment Session.
- **Build distributed exactly-once delivery or a general workflow engine** — rejected: stable ids, idempotent acceptance, and bounded reconciliation cover the real boundary without turning Assignment into infrastructure for speculative edge cases.
- **Overwrite older Assignment Reports with the latest status** — rejected: Source Events remain immutable; only their unobserved Attention Unit is coalesced.
- **Cancel an Assignment Session before closing its request gate** — rejected: a concurrently accepted request could otherwise wake or mutate work after the stop decision.
- **Leave Assignment concurrency unlimited** — rejected: one Human-controlled Host limit provides a predictable local resource boundary.
- **Add per-PersonaBot or per-Workspace concurrency overrides in v1** — rejected: one global setting is easier to understand and sufficient until real workload evidence requires another layer.
- **Queue dispatches after the concurrency limit is reached** — rejected: immediate structured failure leaves the next action with the Orchestrator and avoids adding a second scheduler, queue UI, restart policy, and cancellation lifecycle.
- **Cancel running Assignments when the Human lowers the limit** — rejected: the new value gates later admission while existing execution converges naturally.
- **Apply the limit only when creating a Session** — rejected: waking several idle Assignment Sessions would otherwise bypass the execution boundary; non-waking context injection remains allowed.
- **Let the Orchestrator raise the limit through a tool** — rejected: the Human-owned local resource boundary must not become model-controlled.
- **Count Orchestrator and Subagent Sessions in the Assignment limit** — rejected: this setting counts independent Assignment Sessions; DSH's own execution controls remain responsible for lower-level concurrency.
- **Create a new Session for every follow-up after an Assignment run completes** — rejected: explicit exact-id or Continuity Key reuse preserves useful context when the Session remains resumable and compatible.
- **Resolve duplicate Continuity Keys by recency** — rejected: one key names at most one resumable Assignment Session, and replacement is explicit.
- **Inject the complete Assignment Directory into every Orchestrator turn** — rejected: directed reports, lifecycle notices, and an on-demand query preserve awareness without permanent context growth.
- **Model independent Assignment Sessions as DSH Subagents** — rejected: the communication shape is useful, but Assignment Sessions intentionally have independent Session identity, lifecycle, and Workspace rather than DSH child lineage.
- **Present a Host settlement notice as Assignment-authored content** — rejected: runtime facts and model-authored reports require distinct provenance.
- **Automatically delete inactive Assignments history after a retention window** — rejected: UI/query filtering is sufficient; deletion remains an explicit purge action.
- **Wake immediately for every milestone** — rejected: the shared Wake Policy keeps routine progress digestible while urgent and terminal facts remain immediate by default.
- **Collapse DSH activity and reported outcome into one Assignment status enum** — rejected: it would create a second lifecycle that can disagree with Session facts or the latest semantic report.
- **Emit a Lifecycle Notice for every running/idle transition** — rejected: only meaningful settlement, error, and cancellation boundaries warrant Orchestrator attention.
- **Bind Assignment control to the creating Orchestrator Session** — rejected: Orchestrator Sessions may restart or be replaced while PersonaBot ownership and Assignment continue.
- **Move a Continuity Key away from active Assignments without stopping it** — rejected: one continuing line of work must not have two concurrent holders.
- **Create a BotHarness Assignment id separate from the DSH Session id** — rejected: the Assignment Session is already a DSH Session, so a second canonical identity adds mapping and repair work without a distinct entity.
- **Return every retained Assignment from an unfiltered list call** — rejected: current-attention defaults plus explicit history filters keep model context bounded without deleting history.
- **Give top-level Assignment control tools to Assignment Agents** — rejected: peer control belongs to the Orchestrator; an Assignment Agent manages only its native Subagent descendants.
- **Discard the Host lifecycle notice when a terminal report exists** — rejected: both facts remain auditable while attention coalescing prevents duplicate wake and response.
- **Flatten DSH Subagents into the Assignment Directory** — rejected: descendants remain internal delegation owned by their Assignment Session; only aggregate diagnostic facts cross the boundary.
- **Expose one action-based `manage_assignment` tool** — rejected: five narrow semantic tools keep schemas, authorization, and failure behavior legible; resume is already a waking Assignment Request.

## Consequences

- The Orchestrator can truthfully answer which Assignment Sessions exist and what they are doing without scanning prompts or holding their AgentHandles.
- The model-facing surface is exactly five narrow Assignment tools; raw DSH lifecycle methods and a separate resume action remain hidden.
- Assignment Runtime, not the Orchestrator Agent lifetime, owns Assignment Session creation, resumption, and request delivery and reconstructs runtime handles from durable ownership after restart.
- Every Assignment Request uses exact owned identity or an unambiguous Continuity Key and is auditable and correlated.
- Assignment creation and request delivery use one stable-id intent pattern across the non-atomic SQLite/DSH boundary; ambiguity fails visibly as `needs-repair` without a generic retry state machine.
- Assignment Reports survive cold periods and restarts as Source Events while DSH retains the full execution log.
- Orchestrator awareness comes from addressed tool results, reports, lifecycle notices, and on-demand Directory queries rather than a mandatory per-turn directory dump.
- The Directory presents DSH-derived activity/last-run facts separately from semantic reports and defines no duplicate Assignment lifecycle.
- The DSH Session id is the canonical Assignment identity; Continuity Key is only an optional stable alias.
- Directory listing is filterable and cursor-paginated, defaults to current attention ordered by last visible update, and requires an explicit history filter for inactive rows.
- Local autonomous dispatch stays separate from external Service Action authorization.
- Assignment Request semantics map to DSH `inject`, `steer`, or `followup`; ordinary messages wait for the next safe boundary and never interrupt the active step.
- The Orchestrator chooses whether to answer from Directory facts, wait briefly, or report that an update is pending; the Host only enforces bounded waiting and truthfulness.
- Meaningful proactive Assignment Reports remain immutable while unobserved repeats may share attention; terminal and blocked/waiting facts remain durable.
- Assignment-authored reports remain distinguishable from Host-authored lifecycle notices; both use the shared Trigger and Wake Policy.
- A matching terminal report and lifecycle notice share attention and at most one wake without deleting either Source Event.
- Orchestrator stop authority is ownership-scoped, transactionally fences new delivery, graceful-first, history-preserving, and separate from purge or external-outcome resolution.
- One profile-wide Human-owned Settings value, defaulting to `3`, bounds active independent Assignment Sessions; an excess create or idle-wake call returns structured machine and LLM-readable failure without creating a queue, intent, or dormant DSH Session.
- Inactive Assignments history remains queryable until explicit purge, and compatible idle/completed Assignments may be explicitly reused.
- Assignment authority follows the PersonaBot across Orchestrator Session replacement, while an active Continuity Key holder must be stopped or settle before reassignment.
- Only the Orchestrator controls top-level Assignments; internal DSH Subagents remain owned and addressed by their Assignment Session parent and appear only as aggregate diagnostics.
- All v1 Assignment-to-Assignment coordination is mediated and correlated by the Orchestrator.

## Native Human-wait qualification (2026-10-09)

[#1036](https://github.com/BotHarness/DeepSeekBot/issues/1036) qualifies the
existing independent-root ownership from ADR-0035 on DSH `0.2.0-rc.1`: an
Assignment awaiting native approval can leave its Orchestrator available, but
does not release the Assignment running permit. An Orchestrator's own native
approval or formal question blocks its current step; accepted steering waits for
the next step and does not establish actual model processing. The
[bounded experiment](../research/1036-native-wait-experiment.md) retains exact
Session/call decisions, actual results, unrelated replies and changed/revoked
scope refusals. Cancellation and cold resume remain distinct from preserving
an in-flight operation. No accepted lifecycle or ownership rule is replaced.
[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220) tracks the missing
supported mechanism; #1036–#1038 production continuation gates stay blocked.

The subsequent [isolated RC2 experiment](../research/1220-native-timed-question-experiment.md)
qualifies the native experimental timed-question contract: the original Tool finishes
with pending while its question remains answerable; a real unrelated model reply and a
qualified original-call late answer occur in the same Session. This deliberately differs
from preserving an open Tool Promise. The original baseline's application card cancellation
is retained as negative evidence. The subsequent [DM card tracer](../research/1220-timed-question-card-e2e.md)
correlates the original live Agent/Session/call, distinguishes the native foreground deadline
from cancellation, and routes late answers through the native Service. The native Projection
remains authority; a queued submission is not a settled answer. A Channel answer record is
published only after native settlement. Late delivery enters the existing per-Bot runtime
queue as a fresh application run for the same live Session, retaining the original Source
Event context and rechecking current ownership, DM and source-content fences; that run remains
available until native idle so the model can use its Channel tools. It adds no ordinary input
or Inbox Admission. The process-local correlation does not recover a
cold Agent or add a second executor, Inbox or decision store.
The production runtime stays on RC1. The #1037 candidate below qualifies live resource
accounting separately; the missing same-Orchestrator permission continuation and
#1036/#1038 privacy gates remain unresolved.

## Live approval waits and running permits

The bounded #1037 slice retains the original native approval Promise, Agent, Session and
call. Assignment Runtime may release its application-defined running permit only while
a Human approval is pending, all tool bodies have stopped and no approved call is prepared
to execute. Assignments with any owned descendants conservatively retain their permit:
this slice does not claim descendant quiescence. The durable Directory remains `working`;
process-local `executionWait` distinguishes waiting for the Human from waiting for capacity
without inventing a semantic Report or a second approval store.

At most 32 Assignment Sessions may hold live approval waits, independently of the Human's
1–32 running limit. The Human decision still commits through the owning Channel broker.
Before that outcome returns to native approval, Runtime must reacquire capacity and check
current ownership, identity, Grant and original Source Event authority. The final tool-body
boundary repeats the native operation guard after any capacity wait; the next model step
also requires a permit. Parallel tool bodies and prepared calls retain the permit. Lowering
the limit does not cancel existing execution; later acquisitions observe the current limit.

Only already admitted live waits can await a running permit. New dispatches and idle wakes
still fail immediately at capacity and create no queued delivery intent. This bounded live
resumption is an explicit qualification of the no-dispatch-queue rule, not a durable scheduler.
Stop and abort end the original wait; cold restart retains the existing interrupted/needs-repair
path and never recreates the permit lease, native Promise or original tool execution. See
the [real Host verification](../research/1037-assignment-approval-capacity.md).

## Native live-turn cancellation

When a Human cancels a live Assignment through native DSH Session control, the adapter observes the committed `turn/end` with reason `aborted` and passes the trusted Turn number and end sequence to Assignment Runtime. Runtime atomically projects execution as error, releases its Continuity Key and records one Host/system Lifecycle Notice plus its Inbox Admission, deduplicated by owned Session, Turn and native-aborted cause. The safe summary states cancellation without copying tool input or provider text. It does not fabricate or replace a semantic Report, and it does not claim the continuing Assignment was stopped by its Orchestrator. Existing failed-session admission refuses resuming that errored Session; explicit new work remains possible.

Cancellation independently triggers the existing immediate ready-set harvest. It is not a successful completion paired to a Report; preserved reports may ride the same harvest, and their canonical sources remain independently navigable. Handled cancellation facts survive restart without replay. An Orchestrator-controlled `stop_assignment` keeps its existing confirmed-stop path: the adapter suppresses native cancellation callbacks for that stop, preventing duplicate notices. Pre-acceptance failures and crash-orphaned reconciliation remain separate boundaries; this slice does not synthesize cancellation from an exception string or an error activity projection.

## Native execution-error settlement

A committed native `turn/end` with reason `error` independently confirms unsuccessful execution after acceptance. The adapter passes only its trusted Turn number and end sequence to Assignment Runtime, before propagating the existing adapter failure. Runtime shares the cancellation transaction: it projects error, releases the Continuity Key, and admits one Host/system Lifecycle Notice with state `failed` and cause `native-turn-error`, deduplicated by owned Session, Turn and cause. The summary states execution failure without copying native error messages, provider codes, tool input or credentials. It preserves any semantic progress Report, never pairs it to successful completion and never retries or replaces the Assignment. The notice enters the existing immediate ready-set harvest; handled facts survive cold restart without replay. Orchestrator-controlled stops continue to suppress adapter callbacks. A thrown exception without a committed native error Turn, and crash-orphaned reconciliation, do not establish this boundary.

## Host-startup recovery Notice

On startup, Assignment Runtime selects owned Directory rows still marked `working` with a running stop state. In one application-defined canonical transaction it marks them error, releases their Continuity Keys, and writes one System Lifecycle Notice plus Inbox Admission with state `interrupted` and cause `host-recovery`. This records Host recovery uncertainty, not a native Turn outcome: no Turn number, end sequence or completed-Report link is inferred from stale activity or the latest semantic Report. Original Reports and open asks remain intact. The row transition makes repeated startup idempotent; other activity and stop states do not produce this Notice. A storage failure rolls back the transition and Admission together.

The existing pending-Assignment recovery/ready-set harvest applies the saved source-policy wake mode. With the default immediate policy, one Orchestrator Turn can inspect the recovery Notice and any unobserved progress Report; it never resumes an Assignment implicitly. Observed repair sources remain repair-visible under the existing recovery rules. Once handled, a second cold restart neither recreates the Notice nor repeats the harvest. Native error/cancellation Notices retain their own trusted identity; this path neither fabricates SessionEvents nor resumes, retries or replaces the interrupted Assignment.
