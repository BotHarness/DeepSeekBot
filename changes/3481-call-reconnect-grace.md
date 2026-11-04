---
section: Fixed
---

## en

- A Bot call no longer ends on a short network drop: the computer now waits 15 seconds for the connection to come back instead of 5, and `call-status` counts the drops in `perf.disconnects` ([#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)).

## zh

- 网络短暂中断时 Bot 通话不再立刻结束：电脑现在会等连接恢复 15 秒（原来是 5 秒），`call-status` 也会在 `perf.disconnects` 里统计断开次数（[#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)）。
