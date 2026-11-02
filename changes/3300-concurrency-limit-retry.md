---
section: Fixed
---

## en

- Fixed Bot turns failing at once when a model gateway answers "Concurrency limit exceeded, please retry later": the refusal is now a retryable rate limit, so the turn backs off and retries like other rate limits instead of ending ([#3300](https://github.com/BotHarness/DeepSeekBot/issues/3300)).

## zh

- 修复了模型网关返回「Concurrency limit exceeded, please retry later」时 Bot 本轮立即失败的问题：该拒绝现按可重试的限流处理，本轮会像其他限流一样退避重试，而不是直接结束（[#3300](https://github.com/BotHarness/DeepSeekBot/issues/3300)）。
