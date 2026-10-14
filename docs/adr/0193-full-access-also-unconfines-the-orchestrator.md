---
Status: Accepted
Date: 2026-10-13
Issues: [#1588](https://github.com/BotHarness/DeepSeekBot/issues/1588)
---

# Full access also unconfines the Orchestrator

ADR-0067 gave each PersonaBot a Human-controlled access preset. Its dangerous setting applied to new Assignments only: the Orchestrator, the Session behind the Bot's DM and Group chat, stayed in `workspace-write` with an approval for each opaque tool call. A Human who turned full access on and then asked the Bot in chat still got approval cards and sandbox refusals, with nothing saying why. A 1.2.1 user reported exactly that. Changing a Bot Session's mode through DSH's own controls was worse: every later step was rejected without a reason.

The owner decided that the setting should mean what it says for the chat too, and that the switch must carry a prominent warning.

## Decision

Full access has a scope the Human can switch: **chat and Assignments**, the default when it is turned on, or **Assignments only**, which is ADR-0067's original behaviour. While a PersonaBot's access preset is `danger-full-access` with the chat scope, its Orchestrator runs in DSH `danger-full-access` with approval `never`. File-path checks, the unconfined-tool gate and per-call approval cards no longer apply to it. Turning the preset off returns the Orchestrator to `workspace-write` and `ask` at its next step. Existing Assignments keep the mode they were created with, as before. Orchestrator Subagents stay confined.

The Host owns the Orchestrator's mode. Before each step it compares the Session with the preset and sets it when they differ. If the Session had already been aligned and was changed from outside, the Host restores it and posts one line in the Bot's DM saying where the setting lives. It no longer rejects steps silently.

Two things still apply under full access: file tools and commands that name the credential store are refused, and a tool call cannot request a sandbox escalation for itself. `secret_cli` still runs in the Shell sandbox.

Amended for [#1622](https://github.com/BotHarness/DeepSeekBot/issues/1622): full access means no approval cards at all. `secret_cli` and `secret_mcp_connect` no longer ask on every call for a Session with full access, and the Bot Browser and Computer no longer ask for their session authorization. A Bot can still ask the Human a question (`ask_user_question`) or for a secret (`ask_secret`); those are requests for input, not approvals.

A Bot that already had full access on before this change keeps the Assignments-only scope, so an upgrade does not widen it silently.

The switch shows a red warning at all times, before and after it is turned on, and the confirmation says that the chat Session is included.

## What this gives up

The Orchestrator reads what other people write in Groups and in external IM conversations. Under full access a message from someone else can steer it into running a command on the Human's computer with no approval and no file limit. ADR-0067 kept the Orchestrator confined for that reason. The warning says so; the control is the Human's decision to turn the switch on for that Bot.

In `danger-full-access` DSH does not consult its sandbox, so the kernel read denial for the credential store from ADR-0189 does not apply to the Orchestrator's Shell there. Only the command-text guard remains.

## Consequences

ADR-0067's statement that the Orchestrator never inherits the dangerous preset is superseded. Its Grant, Assignment snapshot and approval rule decisions stand.
