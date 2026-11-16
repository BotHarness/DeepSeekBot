---
Status: Accepted
Date: 2026-11-16
Issues: [#4212](https://github.com/BotHarness/DeepSeekBot/issues/4212)
---

# ADR-0347: Model-free Tob CLI uses the accepted Human DM turn

## Context

The authenticated Human CLI can run application tools directly, but that temporary direct Session has no accepted Tob Human DM. Adding native Shell names to that runner cannot satisfy ADR-0249. A model-free path must exercise the same broker and approval owner while retaining real source authority.

## Decision

The authenticated Host Owner starts a bounded typed CLI request through `tobCli`. BotRuntime appends an actual Human message to that Owner’s protected Tob DM through ChannelStore, then uses its existing canonical Human-DM Source Event claim, Admission acceptance, serialized Orchestrator queue, preparation and completion. No caller chooses an actor, source ID, Session or cwd. This execution variant prepares the same live root Agent and uses DSH-native `Tools.execute` with that Agent scope, without model-step logging. It queues one exact native input, lets the native loop open its real turn, then runs the typed command at the supported pre-step boundary after existing session admission. It rejects model-step entry so the loop closes its own turn; no model request or manual turn event is needed.

An application-defined `deepseekbot_cli` Tool runs the actual CLI parser against a per-invocation broker, sharing the existing capture factory, target checks, ChannelToolApproval, confirmations, revision checks, exact argv/stdin identity and live execution guard with the native Shell path. Its hidden native Node subprocess takes cwd from the owned Agent, including relative-file preparation before the broker call. The Tool is available only during the authenticated direct lease, with a resolved native tool selection; ordinary model turns do not acquire it. The Tool is not a new permission authority. Its owning model-free native invocation holds a process-local lease binding the accepted Human source, Agent, native turn, current request, exact argv/stdin, signal, call ID and surviving trusted Tool Registration. After the existing permission fences, native pre-execute binds the executor token and delegates only that transport to the broker; the native guard and trusted Tool body revalidate it. The broker remains the single exact-operation approval owner, so the transport does not create a second card or expose raw stdin. A known private transport with missing or changed authority is refused before card creation. Model-origin or same-name replacement Tools and ordinary Shell calls do not acquire this delegation. Unknown declarations remain opaque. Recursive `tob-cli` requests are refused by the broker.

One live request is admitted at a time. Starting refuses a busy Orchestrator or direct tool; direct tools cannot borrow its live root. New ordinary DMs queue instead of steering into this execution. Cancellation, stop and runtime closure abort its signal, and the invocation’s broker closes in finally. Preparation and execution retain the canonical source fence. Requests never automatically replay on restart.

Status/results are bounded process evidence: at most sixteen entries, ten minutes after settlement, one MiB combined output per entry, one MiB stdin, 256 argv entries / 64 KiB argv, and a ten-minute execution deadline. Stdin is not copied into the Human DM. A safe request-ID marker on that existing message rejects ordinary DM retry/continuation after the transient lease ends, including after restart. Completed means the invocation settled; its exitCode and JSON stdout retain command refusals. Unknown or expired request IDs are refused. There is no new approval store, database migration or durable command lifecycle. ChannelToolApproval and Source Event/Admission remain authoritative.

## Consequences

Agents can start a production-shaped CLI request, inspect the genuine pending approval through existing Channel/Activity reads, decide through the existing Human CLI or Web card, then retrieve the actual command result. Model integration remains separately testable. Host restart expires result lookup; after uncertainty, inspect the owning command’s canonical readback before starting another request. A captured historical Source Event never grants this path authority.
