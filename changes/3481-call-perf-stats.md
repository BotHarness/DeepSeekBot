---
section: Added
---

## en

- `deepseekbot call-status` now shows how hard a Bot call works: every 5 seconds the Host samples packets per second, kbps, loss, round-trip time and CPU in each direction, and writes the same numbers plus a whole-call summary to the logs, so a change to call performance can be measured before and after ([#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)).

## zh

- `deepseekbot call-status` 现在会显示 Bot 通话的负载：Host 每 5 秒采样一次两个方向的每秒包数、kbps、丢包、往返时间和 CPU，并把同样的数据和整通电话的汇总写进日志，通话性能的改动可以拿前后数据对比（[#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)）。
