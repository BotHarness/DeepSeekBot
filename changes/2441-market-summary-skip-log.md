---
section: Fixed
---

## en

- The Bot Marketplace refresh now logs `skipped: missing-summary-api-key` when generated summaries are off because `SUMMARY_API_KEY` is unset or empty, instead of skipping them silently ([#2441](https://github.com/BotHarness/DeepSeekBot/pull/2441)).

## zh

- Bot 市场的刷新任务在 `SUMMARY_API_KEY` 未设置或为空、自动摘要因此关闭时，会在日志里记一行 `skipped: missing-summary-api-key`，不再悄悄跳过（[#2441](https://github.com/BotHarness/DeepSeekBot/pull/2441)）。
