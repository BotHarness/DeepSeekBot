---
section: Added
---

## en

- A Bot running on Codex can now use the rest of its Bot tools: memory, Channel actions, Assignments, Groups, schedules, to-dos, GenUI cards and, when you allow them, the Bot Browser and Computer. It sees only a few tools up front and finds the others with `tool_search`, so its context stays small. Each tool asks for approval and stays inside the current Channel exactly as it does for a Bot on a DSH model, and the DSH shell, file and web tools are never offered. `deepseekbot engine tools <bot>` shows the same catalog and `deepseekbot engine tool` runs the engine's Memory, to-do, Browser and Computer tools without the model ([#4492](https://github.com/BotHarness/DeepSeekBot/issues/4492)).

## zh

- 运行在 Codex 上的 Bot 现在可以使用其余的 Bot 工具：记忆、Channel 操作、Assignment、Group、定时任务、待办、GenUI 卡片，以及在你允许时的 Bot 浏览器和电脑。它一开始只看到少数几个工具，其余的用 `tool_search` 查找，上下文保持精简。每个工具的审批和 Channel 范围与运行在 DSH 模型上的 Bot 完全一样，DSH 的 shell、文件和网页工具不会提供给它。`deepseekbot engine tools <bot>` 显示同一个工具目录，`deepseekbot engine tool` 不经模型直接运行引擎的记忆、待办、浏览器和电脑工具（[#4492](https://github.com/BotHarness/DeepSeekBot/issues/4492)）。
