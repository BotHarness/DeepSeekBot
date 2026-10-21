---
section: Fixed
---

## en

- Bounded Connect relay reclamation attempts even when upstream deletion fails, so failures cannot exhaust the per-run request budget ([#2410](https://github.com/BotHarness/DeepSeekBot/issues/2410)).

## zh

- 修复 Connect relay 回收失败时未计入每轮尝试上限的问题，避免上游删除失败后继续耗尽请求额度（[#2410](https://github.com/BotHarness/DeepSeekBot/issues/2410)）。
