---
Status: Proposed
Date: 2026-10-11
Issues: [#1378](https://github.com/BotHarness/DeepSeekBot/issues/1378), [#1383](https://github.com/BotHarness/DeepSeekBot/issues/1383)
---

# Private input interaction follows current turn Source Events

The application-defined Bot Schedule persists its prompt and admits a `schedule` Source Event through the existing Bot Inbox and Orchestrator runtime. It stores opaque private references only. Native Credentials Service remains the durable authority for original values and current account bindings; no Schedule credential cache or native DSH Schedule is introduced. Execution and Channel delivery retain their existing, independent authorization checks.

The protected Profile qualifies the four existing `bot_schedule_*` management tools for an owned Orchestrator. Their owning Host commands still check the active run, PersonaBot, locks, limits and trigger. Native `schedule_*` and other unqualified Host capabilities remain unavailable.

`ask_secret` first attempts to reuse the current configured account through the same immutable grant, account binding and canonical Channel proof checks as interactive use. Reuse does not require a live input card. Every protected consumption still checks the current binding immediately before execution; replacement invalidates old references and revocation survives restart. Remembered execution approval never replaces credential authorization.

Opening a new input card additionally requires a current Human interaction. BotRuntime binds its existing current-turn Source Event set to the actual Orchestrator Session ID. Its query accepts a retained canonical `human-message` admitted for that Bot from Human DM or Group interaction, subject to the existing source-effect fences and current Channel availability. Accepted steering and native question continuation carry their actual source set. Historical Chat reads, prompt text, a destination Channel ID and a previous Human turn in the same Session do not establish interaction.

When an unattended run has no complete usable account, `ask_secret` throws a static Owner-action error before creating a card or waiter. The tool guidance tells the model to report the failure without retrying. An Owner can configure or replace the account in interactive Web Chat and explicitly run the Schedule again. The Host prevents unattended input-card creation; it does not claim to prevent every model retry or to change the Bot Inbox retry policy.

Rejected alternatives are granting interaction from a stored Session's history, asking the model whether it is unattended, opening a persistent Human waiter for every scheduled failure, and resolving references into Schedule prompts or global environment variables. The qualified consumer remains the fixed `http-status-v1` CLI from ADR-0164, under the account fencing of ADR-0167. This decision does not qualify credential-consuming MCP, IM initiation or Linux-server deployment.
