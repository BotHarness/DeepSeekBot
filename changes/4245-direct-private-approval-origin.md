---
section: Fixed
---

## en

- Fix model-free private-tool calls that fail to open execution approvals while their Orchestrator is idle; approvals, including policy-protected HTTP GET calls, follow each caller's DM and remain isolated from concurrent callers, Group turns and borrowed Session history ([#4245](https://github.com/BotHarness/BotHarness/issues/4245)).

## zh

- 修复 Orchestrator 空闲时无模型私密工具调用无法显示执行审批的问题；包括被输入策略要求审批的 HTTP GET 在内，审批进入调用方 DM，并与并发调用、Group 任务及借用 Session 的历史保持隔离（[#4245](https://github.com/BotHarness/BotHarness/issues/4245)）。
