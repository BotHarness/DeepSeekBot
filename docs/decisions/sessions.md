# Session, Orchestrator and Assignment decisions

Why a PersonaBot runs as one Orchestrator Session plus independent Assignment Sessions, how they talk, what they may do and how a Human stops them. How it works lives in [the architecture](../architecture/botharness-architecture.md); terms live in [`GLOSSARY.md`](../../GLOSSARY.md); Channels and Inboxes are in [Messaging decisions](messaging.md). Each section states the current decision, the reasons a reader cannot get from the code, and what enforces it. History is in Git: this file replaces ADR-0017, 0024, 0035, 0045, 0059, 0072, 0182, 0186, 0187, 0188, 0193, 0205, 0218, 0250, 0251, 0252, 0260, 0261, 0262, 0263, 0265, 0279, 0282, 0295, 0297, 0306, 0318, 0353, 0354 and 0355, and each section lists the ADRs it absorbed.

Two rules run through every section:

- **DSH owns execution; BotHarness owns who it belongs to.** Session history, live Agents, Subagents, sandbox modes and archive are native DSH. BotHarness adds explicit ownership, the Assignment Directory, Inbox state and the rules that connect them, never a parallel task ledger.
- **The model decides what to say and when it is done; the Host decides what is allowed.** Replies, resolution and delegation are explicit tool calls. Authority, wake, hop limits and permission modes are Host checks the model cannot override.

## 1. A PersonaBot is one Orchestrator plus independent Assignment Sessions, with explicit ownership

<a id="adr-0017"></a><a id="adr-0024"></a><a id="adr-0035"></a>
_Formerly ADR-0017, ADR-0024 and ADR-0035._

Each PersonaBot has at most one Orchestrator root Session, which owns its Inbox, keeps a stable Session ID, wakes on Inbox work and compacts with `compaction-basic`. Each line of work runs in an independent root **Assignment Session** that may have its own Workspace. An Assignment has no separate Task entity or `assignmentId`: its identity is its DSH Session ID. A DSH Subagent stays internal delegation below its parent and is never an Assignment. Ownership is an explicit, durable `session_ownership` row (Session ID, Bot, root role, provenance, parent) written only by the ownership Registry; it is never inferred from cwd, `SessionHeader`, Soul files, Channel history or live `AgentHandle`s. A running Session never moves to another Bot; changing an owner is an explicit, audited repair. Archiving a Bot closes its admission, wake and create gates, stops its whole owned tree and keeps history; reactivating leaves everything cold.

Why: DSH continuable Subagents copy the parent's cwd and preset, are fenced from generic resume, are capped per tree and are orphaned by a parent fork, so Assignments must be roots. DSH's Session metadata is a closed contract and live handles vanish on restart, so ownership needs its own table. A cwd match picks the wrong Bot when several share a Workspace.

If DSH has no saved Orchestrator Session to archive, the Host reserves a replacement before running the mutation. The reservation lives outside Session Ownership because nothing needs to resolve it before publication. A new reservation replaces earlier ones for the same Bot in the same transaction. If the Host can archive the current Session or has no current Session to replace, it clears earlier reservations before running the mutation. Publication inserts the ownership row and removes the reservation in one transaction. A failed mutation keeps its original error even if discard fails.

A successful Memory move returns the new location even if publication fails twice. While a pending move targets the current Memory path, the next turn can claim a fresh Session if the previous Session has a different cwd. A same-directory reservation leaves the current Session eligible. Without a matching reservation, cwd differences alone leave the current Session in place. On startup, the Host publishes a pending replacement if its destination matches current Memory, the path differs from the original, and no newer root exists. It discards the other reservations. Matching an unchanged working directory alone cannot prove the mutation succeeded. `memory-move.test.ts` covers both failure paths and restart outcomes.

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

The product calls a mode a Loadout ([glossary](../../GLOSSARY.md)). `create_assignment` takes it as `loadout`, `list_assignment_models` returns `assignmentLoadouts`, the CLI commands are `loadouts` and `loadout-*`, and Settings says Loadout (配装). The former `mode` parameter and `bot-modes`/`bot-mode-*` commands are still accepted; JSON fields, error codes and `bot-modes.json` keep their names. An A/B on `deepseek-v4.1-flash` (5 delegation tasks, 8 runs each) picked the fitting lean Loadout 40 of 40 times with `loadout` and 39 of 40 with `mode`, so the rename does not cost selection (#5288).

Enforced by: `adr-0187-mode-resolution.property.test.ts`, `bot-modes.test.ts`, `dsh-bot-agent-adapter.test.ts` (mode parameter, recorded mode on resume), `scripts/test/sync-bot-preset.test.mjs` and `pnpm lint` (`sync-bot-preset --check`).

## 16. Subscription Engine Bots keep the small gateway list and their own tools, and instructions tell the jobs apart

<a id="adr-0368"></a>

An engine Orchestrator keeps the MCP gateway as it is: `bot_send_message`, `channel_read` and `inbox_resolve` are listed, and every other Bot tool is found through `tool_search` and run through `tool_call`. An engine Assignment gets only `report_to_orchestrator`. Connector tools granted to a Bot will join the Orchestrator's catalog behind `tool_search`, not a separate MCP server. Engines keep all their own tools, sub-agents, cron and wake-ups included, and their own defaults: the Host sets no tool filter and no tool-search mode, so a Claude Code update keeps working as shipped. On a Claude subscription Claude Code's tool search is on by default and loads its rarely used built-ins on demand. The engine instructions name the jobs that belong to the Bot: a reminder or anything at a time or on a repeat is a Bot Schedule (`bot_schedule_create`), and a task the Human asks to start, or work they should see, follow or steer, or that outlives the turn, is an Assignment (`create_assignment`). The engine's own sub-agents, cron and wake-ups are private help that ends with the engine process. Its sub-agents share the Bot's gateway, so the instructions keep messages, Schedules, Assignments and an Assignment's `report_to_orchestrator` to the engine itself. This is an instruction, not a Host-enforced rule: the gateway cannot yet tell a sub-agent's call from its parent's. An engine Assignment may use its own sub-agents inside the Assignment and asks its Orchestrator for reminders or new visible tasks. Unlike the DSH Orchestrator's Subagent guard (ADR-0265), nothing refuses an engine's sub-agents: they never reach the Assignment Directory, and refusing them would break the engine's own harness.

Why: a live A/B ran Claude Code 2.1.332 and codex-cli 0.172.0 on `deepseek-v4.1-flash` against the real 63-tool engine catalog, 3 runs per arm. On Claude Code, listing every Bot tool cost 24–28% more than the gateway list at the same accuracy (30/30), and a core set of 19 listed tools saved nothing. With Claude Code's tool search off, as it is behind a third-party endpoint, its built-ins made up half of a 22.3k-token prefix; with tool search on, its first-party default, the session cost about half as much ($0.0068 against $0.0130 typical, $0.0062 against $0.0138 heavy), as much as hiding the built-ins saved, while keeping them usable. On Codex with the hand-slimmed descriptions (#5338), listing every tool took fewer steps but cost 30–90% more than the gateway list ($0.0069 against $0.0053 typical, $0.0082 against $0.0043 heavy), all 30/30. With every built-in available, both engines put reminders, including "check that task in 10 minutes", on Bot Schedules and requested tasks on Assignments, and used their own shell or sub-agents for a quick calculation or lookup the Human asked for directly (21/21 on each engine without the paragraph, 21/21 with it); no run used the engine's own cron or wake-ups. In one Codex run a sub-agent repeated the Bot's earlier actions through the shared gateway, creating two extra Assignments; telling the engine to keep Bot actions to itself stopped that in the rerun (3/3). The paragraph costs about 200 tokens and makes the boundary explicit rather than left to the model. Proxying a connector through the gateway was as cheap as giving the engine a separate MCP server (9/9 against 8/9 on both engines) and keeps credentials, account pinning and approvals on the Host.

Enforced by: `engine-persona.test.ts`, `engine-claude.test.ts` (no `disallowedTools` or tool-search variable in the Claude options), `engine-tools.test.ts`.

## 17. An engine's own sub-agents show as read-only Subagents and cannot act as the Bot

<a id="adr-0369"></a>

A Subscription Engine's own sub-agents (a Claude Code `Agent` call, a Codex `spawn_agent` thread) are projected as DSH Subagent Sessions under the engine Session that started them, never as Assignments. The Host writes each one into a child DSH Session with `parentSession` and `origin: 'subagent'`, claims it in Session Ownership with `provenance: 'subagent'`, and records each run of the sub-agent as one turn: its prompt, reasoning, tool calls and results, its answer, and how it ended. The existing Subagent rows, `sessionSubagents`, the Assignment timeline and Bot activity read it like a DSH Subagent; the Human can open it but not steer, continue or archive it, because the engine owns it and it ends with the engine turn. Claude Code is asked to forward sub-agent text (`forwardSubagentText`); no other engine setting changes. Codex 0.169 announces a spawned agent only as a `subAgentActivity` item and never sends its task in clear, so its Subagent is titled from the last segment of `agentPath` and the Orchestrator records a `spawn_agent` call built from that item. A Claude sub-agent that runs in the background, whether asked for with `run_in_background` or acknowledged as `async_launched`, is recorded until its `task_notification` or the end of the parent turn, whichever comes first; its later messages are dropped. A sub-agent cannot use the Bot gateway: the Host refuses its calls with `subagent-not-bot`, through a `PreToolUse` hook and `canUseTool` on Claude Code (`agent_id` / `agentID`) and by matching the gateway call to the Codex child thread's `item/started`. Each Codex `item/started` vouches for one gateway call, and a child item wins over an identical main item. A Codex call with no matching item waits at most one second; it then fails closed while any child thread is running and runs as the engine's own only when none is. Codex gives every thread the same MCP server and token, so the item is the only caller identity it reports; a child call that reaches the gateway before its own item, while an identical main item is still unclaimed, would still run as the engine's own. This narrows ADR-0368: nothing refuses an engine's sub-agents themselves, but their Bot gateway calls are refused.

Why: an Assignment promises its own Workspace Grant, steering, continuation, `report_to_orchestrator` and archive, and an engine sub-agent has none of these; showing it as an Assignment would offer buttons that do nothing. Dropping its messages hid what the Bot was doing, and on Codex its thread's items and `turn/completed` reached the main turn. Sub-agents share the engine's gateway token, so without the refusal a sub-agent could send a message, create a Schedule or Assignment, or end an Assignment early with a terminal report; ADR-0368's instructions alone do not stop that.

Enforced by: `engine-subagents.test.ts`.

## 18. A PersonaBot Session can run on a Subscription Engine

<a id="adr-0353"></a>
_Formerly ADR-0353, with its amendments for the seam (#4485), engine file access (#4655) and Codex device sign-in (#4559)._

A PersonaBot's Orchestrator Session and each Assignment Session can run on a **Subscription Engine**: the Human's own unmodified official agent CLI, signed in with the Human's own subscription and driven by the Host on the Human's own computer. The engines are Claude Code, through `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` set to the Human's installed `claude`, and Codex, through `codex app-server`; a ChatGPT plan is a Codex engine signed in with `codex login`. Only local Hosts offer engines; Cloud and VPS Hosts never do. The model dialog lists engines beside DSH Providers, the Orchestrator and Assignment choices are independent, and a Model Preset can hold either.

- **Harness and tools.** The engine keeps its own native tools; DSH generic tools are not exposed to it. The Bot layer reaches it only through one Host-owned HTTP MCP gateway. Each engine Session gets a bearer token bound to the PersonaBot, the Session, its Channel scope and a capability set, revoked when the Session ends. A tool call runs the existing `ToolDefinition` inside that Session, so identity, scope and Grants are the Host's. Only Bot-layer tools are listed (`bot_send_message`, `report_to_orchestrator`, Assignment tools, Memory, Channel actions and history, Todo, GenUI, Computer and browser, credential requests), most behind `tool_search`.
- **Messages and approvals.** The engine's final text stays private; a Bot speaks only through `bot_send_message`, and an Assignment that ends without reporting has its final text forwarded as an unreported completion. Claude's `canUseTool` and Codex approval requests become `ChannelToolApproval` cards, and Always-allow rules record the engine's tool name.
- **Bot isolation.** The Host builds the system prompt. Claude runs with `settingSources: []` and `strictMcpConfig: true`, so the Human's CLAUDE.md, MCP servers and hooks never enter a Bot.
- **The seam.** An engine Session is an ordinary DSH Session that runs no internal Agent. The Host creates it through the public Session Store and appends the existing event types (`turn/start`, `step/start`, `user/message`, `assistant/message`, `tool/call`, `tool/result`, `step/end`, `turn/end`), so Session detail, Activity, usage and recovery work unchanged. Because it bypasses `DshAgentHost`, the engine runner calls the admission checks itself, writes `approval/asked` and `approval/decided` events, and leaves compaction to the engine. The engine's native session ID is stored on the Session and resumed; one process per Session closes when idle. A lost native session is rebuilt from the Host's records, and an Assignment with no recoverable context ends as failed and reports it.
- **Sign-in and billing.** The Host starts the official sign-in (`claude auth login`, `codex login`, or `codex login --device-auth` for a code entered on another device) and never reads, stores or forwards an engine's OAuth token. It strips provider API-key variables from every engine process and refuses to run a login that is not a subscription: the account report must carry a subscription type and the key source must be `none`. A report of paid overage counts as metered billing. When a subscription is exhausted the Bot stops with a limit card and a reset time, unless the Human set a fallback beforehand (§19).
- **File access follows Host authority.** Before each engine turn the Host resolves the effective access: an Assignment uses its frozen access preset and its current Grant, including the write switch ([Workspace decisions](workspaces.md#adr-0356)); an Orchestrator keeps its private directory and the chat access preset, and gets read-only engine tools while any active Grant is read-only. Codex maps this to its read-only, working-directory or full-access sandbox; Claude Code to read-only tools, approval-gated edits and shells, or bypass. A change of mode closes the process and resumes the native session with the new settings.
- **CLI parity.** `deepseekbot engine list|status|login|use <bot> --role orchestrator|assignment`.

Why: Humans asked to run their Bots on the Claude or ChatGPT subscription they already pay for. Each engine's own harness works best with its own model, and an MCP gateway keeps Bot identity, Channel scope and approvals on the Host instead of in a synthetic CLI Session. Reusing a DSH Session as the log kept every existing view instead of adding a second persistence format. The probe on the Human's Mac showed that stripping `ANTHROPIC_API_KEY` alone still billed a Console-managed key, so the Host checks the login itself.

Enforced by: `engine-session.test.ts`, `engine-claude.test.ts`, `engine-accounts.test.ts`, `engine-runner.test.ts`, `engine-recovery.test.ts`, `engine-approval.test.ts`, `engine-write-authority.test.ts`, `engine-quota.test.ts`, `dsh-bot-agent-adapter-engine-lifecycle.test.ts`, `apps/docs/test/bot-cli-engine-scope.test.ts`.

## 19. Orchestrator turns carry a bounded work context

<a id="adr-0354"></a>
_Formerly ADR-0354, which amends section 2 (formerly ADR-0045)._

An Orchestrator turn may carry a Host work context part after the turn's own input. It starts with `[Host context]` and lists the PersonaBot's active Workspace Grants (id, title, path, whether the Orchestrator may write) and at most 12 unarchived Assignments (Session id, title, Continuity Key, DSH-derived activity). The Host sends it only when its text differs from the last one sent to that Orchestrator Session, and keeps that last text in Host memory, so the first turn after a restart carries it again. It is a Host-authored summary of Directory facts, never an Assignment Report or Lifecycle Notice; details, history and search still go through `list_assignments`, `inspect_assignment` and `list_workspace_grants`. `create_assignment` accepts an omitted `grant_id` when exactly one Grant is active and fails naming the Grants otherwise; raw paths remain unaccepted.

Why: once the coordination prompt made the Orchestrator delegate all real work (#4405), every dispatch began with two lookups. A real-model eval measured 12 to 18 seconds before the first Assignment started, and about 8 seconds with the block. The cap and the change-only rule keep section 2's reason for leaving the Directory out of every turn: unbounded context growth. The system prompt is frozen per Session, so the inventory cannot live there.

Enforced by: `dsh-bot-agent-adapter.test.ts` (work context block), `orchestrator-coordination-prompt.test.ts`.

## 20. Model Fallback is Host-owned and moves a Session at a step boundary

<a id="adr-0355"></a>
_Formerly ADR-0355 (#4410). The ADR was still marked Proposed, but the Host ships it._

A Session's Model Choice may be a Routing Group: an ordered, Host-wide set of routes, Subscription Engine accounts and nested Routing Groups. When a request fails with `QUOTA` or `ACCOUNT_QUOTA`, a missing or invalid credential, or a `429` whose delay exceeds the short-wait bound (or a rate limit that outlasts the existing wait), the Host lets the failed step close, marks a quota-exhausted route as a Resting Route until the provider's named reset (else a default rest), selects the next usable member with `agent.model.select()`, writes a Model Switch Notice and continues the Turn. Each candidate is checked against the PersonaBot owner's role model allowance and credential readiness when it is selected. The Session then stays on the member it moved to until that member fails too, even after the earlier member's rest ends, and the Host remembers that member across restarts. A new Session starts on the Routing Group's first usable member. A limit card appears only when every member is exhausted.

An Assignment stores its chosen Routing Group effort apart from the member that ran; each fallback or resume applies that effort where the member supports it, a member with a pinned effort uses its pin, and an explicit switch to a single model clears the Routing Group and its effort. Several keys for one model are several custom providers in one group; there is no key pool inside a provider. Reading remaining quota belongs to DSH provider adapters, so keys never leave DSH.

Why: an OpenCode Go key answered a real request with `429` and `Retry-After: 452761` (five days) while a DeepSeek key on the same model family still had balance, and the Host only waited on the dead route. DSH's `agent/request-error` hook can only retry the failed step with its captured model. Staying on the new member avoids discarding the provider's prompt cache on every switch back; one failed step's request is lost, never a partial reply, and a step that already streamed is not replayed.

Enforced by: `group-fallback.test.ts`, `assignment-group-fallback.test.ts`, `routing-group-engine-fallback.test.ts`, `default-routing-group.test.ts`, `dsh-bot-agent-adapter-assignment-routing-groups.test.ts`, `dsh-bot-agent-adapter-session-routing.test.ts`.
