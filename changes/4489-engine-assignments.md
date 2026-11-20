---
section: Added
---

## en

- A PersonaBot's Assignments can now run on your Codex or Claude subscription, chosen separately from its Orchestrator: `deepseekbot engine use <bot> claude --role assignment [--model <id>] [--effort <level>]`. The engine works in the Assignment's Workspace Grant, asks through an approval card before anything outside it, and reports to the Orchestrator like any Assignment, with its final text forwarded when it forgets to report ([#4489](https://github.com/BotHarness/DeepSeekBot/issues/4489)).

## zh

- PersonaBot 的 Assignment 现在可以运行在你的 Codex 或 Claude 订阅上，并与 Orchestrator 分开选择：`deepseekbot engine use <bot> claude --role assignment [--model <id>] [--effort <level>]`。引擎在 Assignment 的 Workspace Grant 中工作，Grant 之外的操作会先通过审批卡片询问，并像其他 Assignment 一样向 Orchestrator 报告；忘记报告时会转发它的最终文本（[#4489](https://github.com/BotHarness/DeepSeekBot/issues/4489)）。
