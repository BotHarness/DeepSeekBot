---
section: Changed
---

## en

- Orchestrators no longer start DSH Subagents; they delegate with `create_assignment`, and only Assignments keep `bot_subagent` and `bot_subagent_fork`. `deepseekbot bot-tool` runs those tools on an Assignment named with `--session` ([#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)).

## zh

- Orchestrator 不再启动 DSH Subagent，改用 `create_assignment` 委派；只有 Assignment 保留 `bot_subagent` 和 `bot_subagent_fork`。`deepseekbot bot-tool` 通过 `--session` 指定 Assignment 来运行这些工具（[#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)）。
