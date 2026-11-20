---
section: Changed
---

## en

- A Bot's Orchestrator now acts as a coordinator: it still answers quick questions, updates its Memory and replies itself, but hands web search, research, coding, file work and multi-step analysis to Assignments, splits independent parts into parallel Assignments, and ends its turn instead of waiting so it can take the next message. Each Orchestrator turn now lists its active Workspace Grants and running Assignments, and `create_assignment` uses the only active Grant when none is named, so dispatch takes fewer steps. Answers to real work arrive later than before and use more tokens; you can tune this behavior in the coordination Prompt Part ([#4403](https://github.com/BotHarness/DeepSeekBot/pull/4403)).

## zh

- Bot 的 Orchestrator 现在按协调者工作：快速问答、记忆更新和回复仍由它自己完成，网页搜索、调研、写代码、文件处理和多步分析交给 Assignment，互不依赖的部分拆成多个并行 Assignment，派出后结束本轮而不是等待，以便接收下一条消息。每轮会直接带上当前生效的工作区授权和正在运行的 Assignment，只有一个授权时 `create_assignment` 可以不指定授权，派发步骤更少。实际工作的回答会比以前晚到、用更多 tokens；可以在 coordination Prompt Part 里调整这一行为（[#4403](https://github.com/BotHarness/DeepSeekBot/pull/4403)）。
