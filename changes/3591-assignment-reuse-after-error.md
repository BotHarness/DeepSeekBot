---
section: Changed
---

## en

- An Assignment whose Turn failed, was cancelled or was interrupted by a Host restart keeps its context and Continuity Key: the Orchestrator continues it with another request instead of starting over, and only archiving ends it. A request to an archived Assignment now returns the coded refusal `assignment-ended` ([#3591](https://github.com/BotHarness/DeepSeekBot/issues/3591)).

## zh

- 回合报错、被取消或因 Host 重启被中断的 Assignment 会保留上下文和 Continuity Key：Orchestrator 可以继续向它投递，而不必重新开始；只有归档才会结束它。向已归档的 Assignment 投递现在返回编码拒绝 `assignment-ended`（[#3591](https://github.com/BotHarness/DeepSeekBot/issues/3591)）。
