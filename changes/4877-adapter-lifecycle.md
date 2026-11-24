---
section: Fixed
---

## en

- Fixed retries after a stalled model check and honored Stop while switching away from a Subscription Engine. Assignments now forward final text when their only report was a progress update ([#4877](https://github.com/BotHarness/DeepSeekBot/issues/4877)).

## zh

- 模型检查超时后可以重试，从订阅引擎切回 API 模型时也可以停止当前轮次。事项如果只汇报了进度，会将最终文本转交给协调会话（[#4877](https://github.com/BotHarness/DeepSeekBot/issues/4877)）。
