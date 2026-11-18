---
Status: Accepted — the Human confirmed the design on 2026-11-18; the step-0 spike chose option A (see the amendment)
Date: 2026-11-18
---

# PersonaBot Sessions can run on a Subscription Engine

Humans asked to run their Bots on the Claude or ChatGPT subscription they already pay for instead of a metered API key, as OpenMausBot and t3code allow. Today every Orchestrator Session and Assignment Session runs a DSH Agent that calls a DSH Provider with an API key. We decided that a PersonaBot's Orchestrator Session and its Assignment Sessions can each run on a **Subscription Engine**: the Human's own, unmodified official agent CLI, signed in with the Human's own subscription, driven by the Host on the Human's own computer. The engine keeps its own harness; the Bot layer reaches it only through a Host-owned MCP gateway.

- **Engines.** First Claude Code and Codex. Claude runs through `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable` set to the Human's installed `claude`. Codex runs `codex app-server`. A ChatGPT subscription is a Codex engine signed in through Codex's own ChatGPT login (`codex login`), not a DSH Provider; the token stays inside the CLI. A Host-run Sign in with ChatGPT flow with a token broker, as t3code uses, is deferred: it would make the Host hold an OAuth credential and needs its own ADR amendment defining that exception. Generic ACP engines are a later phase and enter the same gateway through a stdio bridge.
- **Where.** Local Hosts only. Cloud and VPS Hosts never offer Subscription Engines: hosting them would be managing or intermediating the Human's subscription.
- **Roles.** The model dialog lists Subscription Engines beside DSH Providers. The Orchestrator model and the Assignment model are chosen independently, and a Model Preset can hold either. An Orchestrator on one engine can create Assignments on another engine or on a DSH Provider.
- **The engine's own harness.** The engine keeps its native tools (Bash, edit, read and so on), which work best with its own model. DSH generic tools (shell, files, web) are not exposed to it.
- **MCP gateway.** The Host serves one HTTP MCP endpoint. For each engine Session it issues a bearer token bound to the PersonaBot, the Session (Orchestrator or Assignment), the Channel scope that Session already has and a capability set, and revokes it when the Session ends. A tool call resolves the token and runs the existing `ToolDefinition` inside that Session, so identity, Channel scope and Grants are the Host's, never the model's. Only Bot-layer tools are listed: `bot_send_message`, `report_to_orchestrator`, Assignment creation and status, memory, Channel actions and history, Todo, GenUI cards, our Computer and browser, and credential requests. A few are listed directly; the rest load through `tool_search`.
- **Messages.** The existing contract holds: the engine's final text is private, a Bot speaks only through `bot_send_message`, and an Assignment reports only through `report_to_orchestrator`. The existing fallback is kept: an Assignment that ends without reporting has its final text forwarded to the Orchestrator as a completed report marked as unreported.
- **Approvals.** Claude's `canUseTool`, Codex approval requests and ACP `session/request_permission` all become `ChannelToolApproval` cards. "Always allow" rules record the engine's tool name. An Assignment works in its Workspace Grant's `primaryCwd`; an Orchestrator works in the PersonaBot's own empty directory, and writing outside it needs approval.
- **Persona.** The Host builds the system prompt (Soul, memory, team, coordination rules) and isolates the Human's own engine configuration: Claude gets `--strict-mcp-config` and project-only setting sources, so the Human's CLAUDE.md, MCP servers and hooks never enter a Bot.
- **History and processes.** Session identity is unchanged (ADR-0024): one Orchestrator Session per PersonaBot, which receives Inbox batches from every Channel exactly as a DSH Agent does today, and one Assignment Session per Assignment. Each engine Session's native session is its working memory, resumed by an ID stored on that Session; one engine process per Session closes when idle and resumes on the next Inbox batch or Assignment Request, within the existing Bot concurrency limit. Cross-Channel context therefore lives in the single Orchestrator Session as before, plus Memory. The Host's records stay the authority. A lost Orchestrator native session is rebuilt from the Bot Inbox, Channel records and Memory. A lost Assignment native session is rebuilt from its Assignment Directory entry, its Assignment Requests and the persisted Session events (the DSH Session log under option A, the engine Session log under option B). When those are missing, the Assignment ends as failed and reports that to the Orchestrator instead of continuing without context. Either rebuild is announced in the Session detail.
- **Session detail.** Engine events are translated into the existing `SessionTranscriptItem` kinds and live snapshot, so the Session detail panel works unchanged. It adds three states (engine starting, waiting for approval, subscription limit reached with its reset time) and names the engine and account.
- **Sign-in and limits.** The Host detects the CLIs and starts their official sign-in (`claude auth login`, `codex login`, Sign in with ChatGPT). It never reads, stores or forwards an engine's OAuth token. It removes `ANTHROPIC_API_KEY` (and other provider API-key variables) from every engine process's environment, so an inherited key cannot switch a subscription run to per-token billing; the step-0 spike verifies that a run bills the subscription. Remaining quota comes only from what the engine reports (the Claude SDK usage request, Codex rate limits). When a subscription is exhausted the Bot stops and posts a card with the reset time and a one-tap switch to an API model; nothing falls back to metered billing without the Human's choice, except a fallback model the Human set beforehand.
- **Seam (open).** We found no DSH seam that replaces a Session's Agent: `DshAgentHost.create/resume` returns a DSH `AgentHandle` whose context carries tool registration and approvals. A 1–2 day spike decides between **A**, a DSH Session that runs no internal Agent and receives events the Host writes, reusing every view, and **B**, a plugin-owned engine Session with its own log projected into the existing views. Channel messages go through MCP in both.
- **CLI parity.** `deepseekbot engine list|status|login|use <bot> --role orchestrator|assignment` ships with the first slice.

## Considered Options

- **A DSH Provider for the ChatGPT plan over the Responses API** — rejected: GPT works best in Codex's harness, and the ChatGPT plan then becomes one more engine instead of a second path.
- **Driving `claude -p` stream-json by hand, as OpenMausBot does** — rejected: the Agent SDK drives the same binary and already offers `canUseTool` and live MCP changes. Both carry the same terms risk.
- **The engine calls the `deepseekbot` CLI from its shell** — rejected: the CLI acts as the Host owner in a synthetic `direct-*` Session, so Bot identity, Channel scope and approvals would not line up.
- **Expose DSH generic tools to the engine** — rejected: the engine's own tools are better tuned to its model, and two shells would split approval and Grant enforcement.
- **The Host posts the final text, as OpenMausBot does** — rejected: our Bots already decide what to send, where and how often through `bot_send_message`.
- **Read the engine's OAuth token to show quota, as OpenMausBot does** — rejected: Anthropic forbids collecting or intermediating Claude credentials.

## Consequences

- Bots can run with no API key. Anthropic's terms allow a Human to sign in to the unmodified Claude Code binary with their own subscription, but advertised limits assume ordinary individual use, so many always-on Bots may hit limits. The terms also say products built on the Agent SDK should use API keys; this design accepts that wording as a known risk because only the Human's own login and binary are used. OpenAI documents Sign in with ChatGPT for local open-source apps; hosted use needs OpenAI's approval.
- Delivery order: the seam spike; then a tracer bullet with one PersonaBot DM whose Orchestrator runs on Claude, the gateway exposing `bot_send_message` and Channel history, one `canUseTool` approval card and the `engine` CLI; then Assignments; Codex and the ChatGPT plan; the remaining Bot-layer tools; quota display and limit cards; generic ACP.
- Live tests use the Human's own subscriptions on their Mac; CI replays recorded engine traffic.

## References

- [Research: Subscription Engines in OpenMausBot and t3code](../research/2026-11-18-subscription-engines.md)
- ADR-0017, ADR-0048, ADR-0067, ADR-0207, ADR-0342.
- [Anthropic: Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [OpenAI: Sign in with ChatGPT, local open-source flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)

## Amendment 2026-11-18: the seam is option A ([#4485](https://github.com/BotHarness/DeepSeekBot/issues/4485))

The step-0 spike chose **A**: an engine Session is an ordinary DSH Session that runs no internal Agent, and the Host writes its events.

- **Why A works.** The Host creates the Session through the public DSH Session Store (`prepare`, `enter`, `announce`) with a write handle from DSH Session Persistence, so its events persist like any other. It appends the existing event types: `turn/start`, `step/start`, `user/message`, `assistant/message` (with an empty provider stream), `tool/call`, `tool/result`, `step/end` and `turn/end`. The spike prototype showed that DSH accepts this log and that the Session detail transcript projects it without change: input, reasoning, the engine's private final text, engine tools such as `Bash` and Bot-layer tools such as `bot_send_message`, and the turn end. After a crash the Host opens the stored log with a write handle, restores the Session, appends `interruptedTurnClosers` and continues with the next turn; the interrupted tool shows as cancelled.
- **What A costs.** The engine path does not go through `DshAgentHost`, so it does not inherit Agent-loop features: `agent/pre-step` admission, compaction, request retry and `approval/*` events from DSH approval. The Engine Session runner calls the same admission checks itself before a turn, writes `approval/asked` and `approval/decided` events for engine approvals, and leaves compaction to the engine.
- **Why not B.** A plugin-owned Session with its own log would need a second persistence format, a projection into every existing view (Session detail, Activity, usage, tool details, Session Query) and its own recovery rules. A reuses all of them.
- **Not reusing the model-free turn.** The Host already runs a turn without a model for Tob CLI commands, by owning `agent/pre-step` of a live DSH Agent. That path keeps a DSH Agent and its loop and rejects the step, so it cannot carry an engine's many model steps and native tools; it stays specific to the Tob CLI.

### Engine Session interface (for #4486)

One interface over every engine, owned by the Host:

- `start(session, persona, cwd, gateway)` or `resume(session, nativeSessionId)` opens the engine process for one Orchestrator or Assignment Session.
- `send(input)` delivers one Inbox batch or Assignment Request and resolves when the engine's turn ends.
- An ordered event stream of normalized items (input, reasoning, text, tool call, tool result, approval request, rate-limit report, turn end) that the runner writes into the DSH Session.
- `answer(approvalId, decision)` returns a `ChannelToolApproval` decision to the engine.
- `account()` reports the engine's login (see below); `close()` ends the process when idle.

A fake engine that replays recorded traffic implements the same interface for CI.

### The login must be a subscription, not only the environment

Removing `ANTHROPIC_API_KEY` is not enough. The probe on the Human's Mac ran the unmodified `claude` through the Agent SDK with provider key variables removed, no setting sources and no MCP servers. With the CLI signed in to a Console account, its own stored login was a Console-managed API key (`apiKeySource: "/login managed key"`) and the turn billed API credits. After the Human signed in with their Claude subscription, the same probe reported `apiKeySource: "none"`, a subscription type in the account info and a seven-day rate-limit event, and the turn completed on the subscription with no API charge (the SDK's `total_cost_usd` is a notional estimate).

So before an engine Session starts, the Host reads the engine's account report (Claude: the SDK's account info and the `init` key source) and refuses to run it as a Subscription Engine unless the login is a subscription: a subscription type is present and the key source is `none`. The Host checks for presence only, since the reported plan name differs between surfaces. Codex follows the same rule with its own account report. The refusal tells the Human to sign in with the subscription account.

Claude reports subscription limits through rate-limit events, including whether paid overage is enabled and in use. A report that the run is using paid overage counts as metered billing and stops the Bot like an exhausted limit, unless the Human chose a fallback beforehand.

Claude Code does not ask `canUseTool` for commands it treats as read-only (the probe's `ls` ran without a request), so approval cards cover only what the engine itself asks about; #4487 tests the deny path with a writing command.
