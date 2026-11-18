---
section: Fixed
---

## en

- When a model's quota or balance runs out (for example an OpenCode Go weekly limit), the Bot no longer retries the same model for minutes and then stops after three failures. It pauses at once, says which model ran out and when it resets, and other Bots on that model pause without sending a request until the reset ([#4414](https://github.com/BotHarness/DeepSeekBot/issues/4414)).

## zh

- 模型额度或余额用完时（例如 OpenCode Go 的每周额度），Bot 不再在同一个模型上重试几分钟、连续失败三次后才停下，而是立即暂停，并说明是哪个模型额度用完、什么时候重置。使用同一模型的其他 Bot 在重置前也会直接暂停，不再发出请求（[#4414](https://github.com/BotHarness/DeepSeekBot/issues/4414)）。
