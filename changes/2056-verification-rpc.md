---
section: Fixed
---

## en

- Local verification RPCs use fresh connections after client stalls, avoiding stale pooled-socket failures while preserving uncertain mutation outcomes without automatic retries ([#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)).

## zh

- 本地验证 RPC 使用新连接，避免客户端停顿后复用失效连接；写操作响应丢失时保留不确定结果，不自动重试（[#2056](https://github.com/BotHarness/DeepSeekBot/issues/2056)）。
