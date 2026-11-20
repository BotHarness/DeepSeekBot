---
section: Fixed
---

## en

- Fixed stale Skill catalogs during Host refreshes and Orchestrator Agent changes, and restored live updates after temporary filesystem watcher failures; a watcher that exhausted its retries restarts on the next roster or Agent change. A failed Host refresh, an Agent switch with different Host Skills, and a Memory Repository that appears after startup no longer leave the menu stale ([#4234](https://github.com/BotHarness/BotHarness/issues/4234)).

## zh

- 修复 Host 刷新和 Orchestrator Agent 切换时 Skill 目录未更新的问题，并在文件监听器暂时出错后恢复实时更新；重试耗尽的监听器会在下次 Bot 名单或 Agent 变化时重新启动。Host 刷新失败、切换到 Host Skill 不同的 Agent，以及启动后才出现的 Memory Repository，也不会再让菜单停留在旧内容（[#4234](https://github.com/BotHarness/BotHarness/issues/4234)）。
