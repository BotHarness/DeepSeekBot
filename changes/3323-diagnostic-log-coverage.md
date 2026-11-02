---
section: Added
---

## en

- The diagnostic log now records each Bot turn (duration, model time, first token, tools and errors) and each incoming IM message (handled, skipped with the reason, or refused), without message content. `deepseekbot diagnostic-logs-export` can now export the log offline from `logs.db` when the desktop app or Host cannot start ([#3323](https://github.com/BotHarness/DeepSeekBot/pull/3323)).

## zh

- 诊断日志现在会记录每个 Bot 回合（耗时、模型时间、首字时间、工具与错误）和每条收到的 IM 消息（已处理、跳过及原因、或被拒绝），不记录消息内容。桌面端或 Host 无法启动时，`deepseekbot diagnostic-logs-export` 也能直接从 `logs.db` 离线导出日志（[#3323](https://github.com/BotHarness/DeepSeekBot/pull/3323)）。
