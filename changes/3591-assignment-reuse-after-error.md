---
section: Changed
---

## en

- An Assignment whose Turn failed, was cancelled or was interrupted by a Host restart keeps its context and Continuity Key: the Orchestrator continues it with another request instead of starting over, and archiving files it away when the work is done. Sending a request to an archived Assignment unarchives it and delivers the request ([#3591](https://github.com/BotHarness/DeepSeekBot/issues/3591)).

## zh

- 回合报错、被取消或因 Host 重启被中断的 Assignment 会保留上下文和 Continuity Key：Orchestrator 可以继续向它投递，而不必重新开始；做完后用归档把它收起来。向已归档的 Assignment 投递会自动取消归档并照常投递（[#3591](https://github.com/BotHarness/DeepSeekBot/issues/3591)）。
