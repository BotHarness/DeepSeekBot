---
Status: Accepted
Date: 2026-10-14
Issues: [#1731](https://github.com/BotHarness/DeepSeekBot/issues/1731)
---

# Bot Sessions follow DSH's permission mode for Shell and plugin tools

> Amends [ADR-0067](0067-workspace-grants-bound-personabot-file-access.md): Shell and other opaque tools no longer need a BotHarness approval for each call.

A Human who installs a DSH plugin, or writes their own tool, expects it to work the same way when a PersonaBot calls it as when they call it in a plain DSH Session. Under ADR-0067 BotHarness put its own approval card in front of every Shell call and every tool it did not know, and denied any `sandbox_permissions` escalation. A Windows user with dsh-ops saw `ops_bash` and `pwsh` behave differently in a Bot than in DSH, and had to approve every call. We decided that **a PersonaBot's Orchestrator and Assignment Sessions run Shell and plugin tools under the Session's own DSH sandbox mode and approval policy, with no extra BotHarness approval. When DSH itself asks for permission, the ask is shown as a Tool approval card in the Bot's Channel.**

## Decision

- **DSH decides.** A tool BotHarness does not provide and that is not a path-checked native file tool runs as DSH runs it: `workspace-write` confines it the way its own sandbox does, and `danger-full-access` does not. BotHarness adds no card and no denial for it.
- **DSH asks reach the Bot Channel.** BotHarness tracks each such call while it runs, so an `approval/request` the tool raises, such as Shell asking for `sandbox_permissions`, appears as a Tool approval card in the Channel the task came from (or the Bot DM), with the same saved-rule matching as before. Orchestrator Subagents keep `never`, so DSH refuses their escalations without asking.
- **What stays.** Path-addressed native file tools still check Workspace Grant roots on every call, and a native Shell's `workdir` must be in a Grant or Memory. Secret tools (`secret_cli`, `secret_mcp_connect`) keep each-use approval ([ADR-0191](0191-a-bot-runs-a-command-line-tool-with-owner-secrets-per-approved-call.md)), editing an original attachment keeps its approval, Browser and Computer keep their device authorization, and the credential store stays out of Shell and file tools. Revoking a Grant still stops the next call.
- **Why.** The Bot changes who talks to the Session, not what the Session may do. A second approval layer made plugin tools unusable in practice and made Bots behave unlike the DSH mode the Human picked.
