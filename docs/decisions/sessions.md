# Session, Orchestrator and Assignment decisions

Why a PersonaBot runs as one Orchestrator Session plus independent Assignment Sessions, how they talk, what they may do and how a Human stops them. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); Channels and Inboxes are in [Messaging decisions](messaging.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0017, 0024, 0035, 0045, 0059, 0072, 0182, 0186, 0187, 0188, 0193, 0205, 0218, 0250, 0251, 0252, 0260, 0261, 0262, 0263, 0265, 0279, 0282, 0295, 0297, 0306 and 0318, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **DSH owns execution; BotHarness owns who it belongs to.** Session history, live Agents, Subagents, sandbox modes and archive are native DSH. BotHarness adds explicit ownership, the Assignment Directory, Inbox state and the rules that connect them, never a parallel task ledger.
- **The model decides what to say and when it is done; the Host decides what is allowed.** Replies, resolution and delegation are explicit tool calls. Authority, wake, hop limits and permission modes are Host checks the model cannot override.

## 1. A PersonaBot is one Orchestrator plus independent Assignment Sessions, with explicit ownership

<a id="adr-0017"></a><a id="adr-0024"></a><a id="adr-0035"></a>
_Formerly ADR-0017, ADR-0024 and ADR-0035._

Each PersonaBot has at most one Orchestrator root Session, which owns its Inbox, keeps a stable Session ID, wakes on Inbox work and compacts with `compaction-basic`. Each line of work runs in an independent root **Assignment Session** that may have its own Workspace. An Assignment has no separate Task entity or `assignmentId`: its identity is its DSH Session ID. A DSH Subagent stays internal delegation below its parent and is never an Assignment. Ownership is an explicit, durable `session_ownership` row (Session ID, Bot, root role, provenance, parent) written only by the ownership Registry; it is never inferred from cwd, `SessionHeader`, Soul files, Channel history or live `AgentHandle`s. A running Session never moves to another Bot; changing an owner is an explicit, audited repair. Archiving a Bot closes its admission, wake and create gates, stops its whole owned tree and keeps history; reactivating leaves everything cold.

Why: DSH continuable Subagents copy the parent's cwd and preset, are fenced from generic resume, are capped per tree and are orphaned by a parent fork, so Assignments must be roots. DSH's Session metadata is a closed contract and live handles vanish on restart, so ownership needs its own table. A cwd match picks the wrong Bot when several share a Workspace.

Enforced by: `session-ownership-boundary.test.ts` (only `sessions/ownership.ts` writes `session_ownership`), `session-ownership.test.ts`.

## 2. The Orchestrator manages Assignments through a durable directory, and archive is the only end

<a id="adr-0045"></a><a id="adr-0262"></a><a id="adr-0295"></a>
_Formerly ADR-0045, ADR-0262 and ADR-0295._

The **Assignment Directory** is a read model over Session ownership plus DSH Session facts: Title (about 40 characters) and Description chosen at `create_assignment`, Continuity Key, Workspace, model, DSH-derived activity and last run, the latest Assignment Report and descendant activity. Activity and reported outcome stay separate fields. `list_assignments` defaults to what needs attention, pages with opaque cursors and hides archived rows unless asked. Creating checks the profile-wide Assignment Concurrency Limit atomically and records an Assignment Delivery Intent; a refused create leaves nothing. Sending a request to an idle Assignment is the resume operation. An Assignment is **active** until the Orchestrator archives it through DSH's native archive; `error` is an execution fact, not an end, so a request or a create with the same Continuity Key continues the same Session with a Host note to check side effects. A request to an archived Assignment unarchives it and retries once (`unarchived: true` means only that the archive was undone); at the runtime seam the refusal is coded `assignment-ended`. Nothing archives automatically.

Why: the Orchestrator's context forgets after compaction, so it needs a durable list it can query, not a memory. Treating a failed turn as the end threw away a Session whose context still existed.

Enforced by: `assignment-archive.test.ts`, `assignment-title.test.ts`, `assignment-collaboration.test.ts`.

## 3. Assignments and the Orchestrator talk only through the Bot Inbox

<a id="adr-0059"></a>
_Formerly ADR-0059._

`create_assignment` returns the Session ID right after durable admission and does not wait. An Assignment reports to its Orchestrator with an **Assignment Report** (`progress`, `completed`, `blocked`, `waiting-human`, `failed`) and asks with a report whose `expects-reply` is set; an ask ends the Assignment's turn and never holds a tool call open. The Orchestrator answers with `send_assignment_request` and `answer_to`; there is no timeout or reminder, and an unanswered ask stays visible across restarts. Report state only suggests attention; the Host's wake policy decides, and an immediate report reaches a running Orchestrator at its next turn boundary. Inbox items are pointers to the Session, not copies of its log; oversized bodies spill, and `inspect_assignment` reads a bounded window of Session events. Unobserved repeats from one Assignment coalesce into one wake. A request with `answer_to` to an errored Assignment is refused, because the answer may already sit in the native Inbox.

Why: one admission path for both directions keeps parallel Assignments ordinary work, survives restarts, and leaves no second mailbox that could disagree with the Inbox.

Enforced by: `assignment-report.test.ts`, `assignment-report-delivery.test.ts`, `assignment-collaboration.test.ts`.

## 4. The Orchestrator triages its own Inbox

<a id="adr-0188"></a>
_Formerly ADR-0188._

An Inbox Admission is **unread** until a turn observes it, then **open** until the Orchestrator resolves it as `done` or `ignored`; a snoozed item is open but hidden until it returns. Ending a turn resolves nothing. The tools are `inbox_list` (grouped, filtered, cursor-paged), `inbox_resolve` (ids, or a filter that first returns a count and a confirmation token), `inbox_ignore` (one Channel message) and `inbox_snooze` (returns at `until` or earlier on a new event in the same conversation or Assignment). Resolution is stored beside the execution attempt state, which stays a separate fact. Bot Self-Records are admitted already resolved.

Why: marking everything a turn saw as handled lost requests the Bot never acted on, including creates refused at the concurrency limit, and left the only record in history that compaction removes. DSH has no unread state on Sessions, so this one is ours.

Enforced by: `inbox-triage.test.ts`, `inbox-snooze.test.ts`, `inbox-triage-continuation.test.ts`.

## 5. Orchestrators delegate through Assignments; Assignments may use Subagents

<a id="adr-0251"></a><a id="adr-0252"></a><a id="adr-0265"></a>
_Formerly ADR-0265, ADR-0251 and ADR-0252._

Only Assignment Sessions, and the Subagents they start, install `bot_subagent`, `bot_subagent_fork` and `list_bot_subagent_models`. The Orchestrator gets a guard that refuses these and the native `subagent`, `subagent_fork` and `list_subagent_models` with a pointer to `create_assignment`. `bot_subagent` picks a native preset from an allowed explicit `agent_preset`, then `subagent.agentPreset`, then the DSH registry's current default; `bot_subagent_fork` keeps native inheritance. Direct CLI calls of these tools name an Assignment with `bot-tool --session` and return `parent-unavailable` without a live parent. A native `agent-message` or `subagent-settled` for an idle, available Orchestrator enters the owning Bot Runtime as a report-only turn with no ambient source: replies must reference a trusted source or name an authorized target.

Why: two overlapping delegation paths let work skip the Assignment Directory, Workspace Grants and the Group Work panel, and the Human could not see which direction ran on which model.

Enforced by: `direct-bot-tools.test.ts`, `native-subagent-runtime.test.ts`, `native-subagent-wake.test.ts`.

## 6. Direct CLI calls create and continue Orchestrator-owned Assignments

<a id="adr-0297"></a><a id="adr-0306"></a>
_Formerly ADR-0306; ADR-0297 (a separate machine dispatch queue) was rejected and never built._

`deepseekbot bot-tool` may call `create_assignment` and `send_assignment_request` as the Orchestrator would. The Assignment belongs to that Bot's Orchestrator; there is no system-owned Assignment. Without `--source`, each call records a `system-message` Source Event as its audit anchor, with no Admission. A created, reused or delivered call adds a silent `assignment-lifecycle` notice to the Orchestrator's Inbox. Capacity, Grants, Continuity Key reuse, failed-turn recovery and archive reactivation apply unchanged; a create with a busy key returns `key-busy` and an idle one returns `reused` (not idempotent). `wait_for_assignment` stays turn-only.

Why: scripts could stop an Assignment but not start one. A general machine task queue would be the Task entity §1 rules out, and an Assignment with no Orchestrator has nobody to report to.

Enforced by: `direct-bot-tools.test.ts`, `assignment-collaboration.test.ts`.

## 7. Bot Sessions follow DSH's permission mode; full access follows the root Session

<a id="adr-0193"></a><a id="adr-0205"></a><a id="adr-0260"></a>
_Formerly ADR-0205, ADR-0193 and ADR-0260; they amend parts of ADR-0067._

Shell and plugin tools in Orchestrator and Assignment Sessions run under the Session's own DSH sandbox mode and approval policy; BotHarness adds no approval of its own, and a DSH permission ask appears as a Tool approval card in the task's Channel. Path-addressed native file tools still check Workspace Grants, secret tools keep per-call approval, and the credential store stays out of Shell and file tools. A Bot's full-access preset has a scope: **chat and Assignments** (default when turned on) puts the Orchestrator in DSH `danger-full-access`; **Assignments only** keeps it in `workspace-write`. An Assignment keeps the mode it was created with. A delegated Subagent has full access exactly when its same-Bot root does, with approval `never`, and the Host re-aligns Orchestrator and Subagent modes before each step. Bots owned by another Team member never get full access. The switch always shows a red warning.

Why: a second approval layer made plugin tools unusable and made Bots behave unlike the DSH mode the Human chose. Confining the chat or a Subagent while its root had full access protected nothing and produced silent refusals. The cost is real: under chat-scoped full access, text from other people can steer the Orchestrator into commands with no approval, which is why the warning stays.

Enforced by: `full-access-inheritance.property.test.ts` (any root role, preset, scope, snapshot, Team ownership and Subagent depth, including a chain that crosses to another Bot), `assignment-access.test.ts`.

## 8. Bots speak through explicit messages and may conclude a turn

<a id="adr-0250"></a>
_Formerly ADR-0250._

`bot_send_message` is the outward text and attachment tool; ordinary assistant output stays private, and nothing extracts a final answer. A reply is addressed by a trusted, owned Source Event; a proactive message names an authorized target, and the Channel/Outbox owner rechecks authority. A message may resolve selected Inbox items; delivery comes first, and a failed cleanup is reported, never "fixed" by resending. `end_turn` defaults to false and calls native `concludeTurn()` only after successful delivery and cleanup.

Why: automatic final-text delivery made every turn speak, even when silence or a later message was right.

Enforced by: `bot-message-tool.test.ts`.

## 9. Bot messages wake colleagues on every round; the hop limit only stops runaways

<a id="adr-0261"></a>
_Formerly ADR-0261, which superseded the per-chain de-duplication of ADR-0036 and ADR-0206 ([Messaging decisions](messaging.md#adr-0206))._

A direct Bot-to-Bot mention or Bot DM admits its recipient on every send within the trusted hop limit, and ordinary Group delivery follows each member's wake policy on every Bot message. The hop limit defaults to 128 (`DEFAULT_BOT_HOP_LIMIT`, configurable; ADR-0261 set 32, ADR-0036 started at 8). When a committed message does not wake a colleague it addressed, `bot_send_message` returns `notWoken` with each ID and reason. External IM Bot mentions carry no trusted causation, so after 16 Bot-sent messages in a row within an hour in one external conversation, further Bot mentions are kept as context without waking.

Why: a reviewer sending work back is a normal workflow, and the per-chain de-duplication silently stopped it half done. Whether a Bot speaks is the Bot's choice, shaped by its Soul and Memory; the Host only stops loops.

Enforced by: `bot-hop-limit.test.ts`, `bot-hop-limit.property.test.ts` (any limit, Bot count and relay order where every Bot always relays: exactly the allowed hops commit, the next is refused undelivered), `bot-group-review-rounds.test.ts`, `bot-group-steered-causation.test.ts`.

## 10. Asks follow the Channel the task came from, and questions do not block the Bot

<a id="adr-0186"></a><a id="adr-0187"></a>
_Formerly ADR-0186 and ADR-0187._

Tool approvals, `ask_user_question` cards and `request_workspace_grant` from an Orchestrator turn are posted in that turn's inbound Channel when it is a Group the Bot belongs to or its Human DM, and fall back to the Human DM otherwise (Assignment asks, Schedules). Only the local Human decides, in the Channel that holds the card; Bots and Group membership cannot answer. The product ships a `deepseekbot` agent preset, generated from DSH `standard` by `scripts/sync-bot-preset.mjs`, whose only difference is `tool-ask-user` in timed mode with a 45-second foreground wait, so the Bot keeps working while the card stays answerable. Tool approvals still hold the turn.

Why: a Human who mentioned a Bot in a Group saw nothing there while a card waited in the DM. An open question froze the Orchestrator for every other conversation.

Enforced by: `asks-follow-channel.test.ts`, `timed-question-recovery.test.ts`, `scripts/test/sync-bot-preset.test.mjs` and `pnpm lint` (`sync-bot-preset --check`).

## 11. The Bot DM is the Bot's timeline, and its Sessions are a projection

<a id="adr-0072"></a><a id="adr-0182"></a>
_Formerly ADR-0182 and ADR-0072._

A Bot post in a Group or Bot DM writes, in the same transaction, a `botChannelPost` notice in the Bot's Human DM that stores only the Channel and message IDs; its excerpt is projected on read, so a purged post shows as unavailable. Self-Records caused elsewhere also get a placement in the DM. Each kind of line can be turned off. The DM's Sessions panel is a read model over owned DSH root Sessions (Orchestrator and Assignments, never Subagents) with DSH's own title, cwd and running state; native Session headers and menus offer a return action only for an owned root.

Why: a Group reply left no trace in the DM, so the Human could not follow what the Bot did. A separate task list would duplicate DSH's Session catalog.

Enforced by: `bot-dm-trace.test.ts`, `bot-sidebar.test.ts`.

## 12. Humans stop Sessions; an interrupted DM turn can continue

<a id="adr-0279"></a><a id="adr-0282"></a>
_Formerly ADR-0282, and ADR-0279 (Proposed, built: `channelRetry` with `recovery: continue`)._

A Human stops one running Session or all of one Bot's Sessions; Subagents stop with their parent, and a Group has no stop for all its Bots. The composer has no Stop; it lives in the Sessions panel, the Messages header and the mobile Work tab, with `/stop` on IM surfaces. Stopping interrupts the current turn and holds nothing: the next wake starts a new turn with a Host note. Stopping is safe at any point: half-streamed messages are discarded, held Group drafts are invalidated, interrupted tool calls are recorded with an unknown result, open approval cards close, and a stop that does not settle in 30 seconds discards the run. A failed Human DM turn can be continued in the same Session with a Host note to check unknown-outcome calls, keeping the original Source Event addressing.

Why: a composer Stop could not say which of a Bot's Sessions it meant and did not stop Assignments or provider retries. Replaying a long failed turn from the start would repeat its side effects.

Enforced by: `session-stop.test.ts`, `bot-stop-hold.test.ts`, `stop-safety.test.ts`, `turn-continue.test.ts`.

## 13. Humans tune the Orchestrator's model and behavior text, not its contracts

<a id="adr-0218"></a><a id="adr-0263"></a>
_Formerly ADR-0218 and ADR-0263._

Quick model and effort selection (`/model`, `/effort`, the composer footer) changes only the Bot's Orchestrator, through `modelPlanCustomize`; a plan without Assignment routes leaves Assignments on global inheritance. The Orchestrator prompt is split into named Prompt Parts that a Human may rewrite through Prompt Presets (Bot override, Bot preset, global preset, built-in), while tool names, `source_event_id` and `answer_to` rules and the Inbox structure stay fixed. A Session freezes its resolved texts in `prompt_snapshot` on first use and refreshes them only at compaction.

Why: a quick choice must not silently pin Assignment routes. Editing whole prompt sections could break reply delivery and answer routing, and changing text mid-Session would invalidate the cached prompt.

Enforced by: `prompt-presets.test.ts`, `prompt-preset-methods.test.ts`, `bot-model-route.test.ts`.

## 14. Steering delivers input first and scans Memory off the Host thread

<a id="adr-0318"></a>
_Formerly ADR-0318, which amends ADR-0092._

Local DM or Group-mention input steers an active turn at once, with Memory changes already admitted. The Memory scan then runs on the asynchronous Git runner; a new change it finds is steered as its own message at the next safe step. Steers during a scan coalesce into one more scan, and a failed scan never fails the input.

Why: synchronous Git on the Host thread froze a live voice call for seconds at a time on Windows.

Enforced by: `human-dm-steer.test.ts`, `memory-turn-async.test.ts`.

## 15. Bots run in a chosen DSH mode, and the Orchestrator picks one per Assignment

<a id="bot-modes"></a>
_Amends section 10 (formerly ADR-0187)._

Tobs (`deepseekbot`) is the product default mode, not the only one. A Profile-wide default in `$DSH_HOME/botharness/bot-modes.json` replaces it for every Bot without its own mode, and a Bot's `preset` field is its own mode. Both accept only a mode in the native roster that loaded. The mode is resolved when an Orchestrator or Assignment Session is created; DSH refuses `agent-preset/locked` once a Session has started, so a change applies from the next new Session. A Session that is set up again mounts the mode its log records, not the Bot's current mode.

A mode template names the modes a Bot may use; without one every installed mode is allowed. It bounds the Bot's own mode, the modes its Orchestrator may give an Assignment, and a Bot that follows the default: when the default is outside the template the Bot uses the template's first installed mode. A template edit or assignment that would leave out a Bot's own mode is refused with `mode-not-allowed`. Members’ Bots use the same mode-template selection rules. The execution gate also applies the [Team mode restrictions](team-mode.md#approvals-attention-and-offboarding), including the Owner-only `danger-full-access` Assignment preset.

`create_assignment` takes an optional `mode` from the allowed set, stored in `assignments.agent_preset`; without it the Assignment uses the Bot's mode. When a Bot may use more than one mode, the `mode` parameter lists the allowed ids as an enum with each mode's description, read when the Orchestrator Session is prepared; the run-time check still refuses a mode the template no longer allows. Beside Tobs the bundle ships three scenario modes generated by `scripts/sync-bot-preset.mjs`: `tobs-research` (web and files, no terminal), `tobs-code` (terminal, files, jobs, skills, web) and `tobs-script` (terminal and files). Each copies the generated Tobs preset and keeps a fixed list of its plugins, so timed questions and the disabled native Subagent tools carry over. The default Assignment mode stays the Bot's mode.

Outside a Tobs mode a pending question card holds the Bot again, and the Settings note says so. The Bot's own tools are installed on every mode; a mode whose model gets no harness tools, such as `dsh-ntr`'s ACP mode, cannot reply in a Channel or report an Assignment.

Why: users installed other DSH modes and expected a Bot to run in them. An A/B on `deepseek-v4.1-flash` (5 tasks, 30 runs per arm) showed the Orchestrator keeps the default mode unless it sees the alternatives where it starts the Assignment: with modes only in `list_assignment_models`, which it never called, it chose another mode for 4 of 42 Assignments; with the list in the `mode` parameter, 31 of 38, at 7% lower cost than Tobs everywhere and a judge score of 4.93 against 4.83. Making `minimal` every Assignment's default cost more on web research than it saved on scripts.

Enforced by: `adr-0187-mode-resolution.property.test.ts`, `bot-modes.test.ts`, `dsh-bot-agent-adapter.test.ts` (mode parameter, recorded mode on resume), `scripts/test/sync-bot-preset.test.mjs` and `pnpm lint` (`sync-bot-preset --check`).
