---
section: Fixed
---

## en

- Fixed Bot turns failing within seconds when a serial model or gateway answers "Concurrency limit exceeded, please retry later": a Bot request now backs off and retries such refusals for up to 300 seconds, matching how long a direct DSH chat waits, so several Bots woken at once take turns instead of failing ([#3300](https://github.com/BotHarness/DeepSeekBot/issues/3300)).

## zh

- 修复了串行模型或网关返回「Concurrency limit exceeded, please retry later」时 Bot 本轮几秒内就失败的问题：Bot 请求现会对这类拒绝退避重试，最长等待 300 秒，与 DSH 直连的等待时长一致，同时被唤醒的多个 Bot 会依次完成而不是直接失败（[#3300](https://github.com/BotHarness/DeepSeekBot/issues/3300)）。
