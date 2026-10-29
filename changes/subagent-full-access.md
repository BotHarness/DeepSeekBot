---
section: Fixed
---

## en

- Full access now also applies to the Subagents a Bot delegates to. Before, the Host put every Orchestrator Subagent back in `workspace-write` inside the Bot's Memory, so with full access on, delegated edits outside Memory were refused or landed in Memory with no explanation. Subagents of a full-access Assignment are no longer held to the Grant by native file tools either ([#2870](https://github.com/BotHarness/DeepSeekBot/issues/2870)).

## zh

- 完全访问现在也覆盖 Bot 分派出去的 Subagent。此前 Host 会把每个 Orchestrator Subagent 改回 Bot Memory 内的 `workspace-write`，开启完全访问后，分派出去的修改在 Memory 之外会被拒绝或落进 Memory，且没有任何说明。完全访问 Assignment 的 Subagent 也不再被原生文件工具限制在 Grant 内（[#2870](https://github.com/BotHarness/DeepSeekBot/issues/2870)）。
