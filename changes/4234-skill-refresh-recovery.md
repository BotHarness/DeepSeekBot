---
section: Fixed
---

## en

- Fixed stale Skill catalogs during Host refreshes and Orchestrator Agent changes, and restored live updates after temporary filesystem watcher failures; a watcher that exhausted its retries restarts on the next roster or Agent change ([#4234](https://github.com/BotHarness/BotHarness/issues/4234)).

## zh

- 修复 Host 刷新和 Orchestrator Agent 切换时 Skill 目录未更新的问题，并在文件监听器暂时出错后恢复实时更新；重试耗尽的监听器会在下次 Bot 名单或 Agent 变化时重新启动（[#4234](https://github.com/BotHarness/BotHarness/issues/4234)）。
