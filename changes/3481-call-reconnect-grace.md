---
section: Fixed
---

## en

- A Bot call survives a short drop of its audio link: the computer now waits 15 seconds for the link to recover instead of 5 (the call still ends after 8 seconds without the phone's heartbeat), and `call-status` counts the drops in `perf.disconnects` ([#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)).

## zh

- Bot 通话的音频链路短暂断开时不再立刻结束：电脑现在会等链路恢复 15 秒（原来是 5 秒；手机心跳中断 8 秒仍会结束通话），`call-status` 也会在 `perf.disconnects` 里统计断开次数（[#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)）。
