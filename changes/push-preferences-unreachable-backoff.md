---
section: Fixed
---

## en

- The app no longer re-sends notification choices to an unreachable Computer each time another Computer reconnects; it now retries with backoff, saving battery and network ([#3946](https://github.com/BotHarness/DeepSeekBot/pull/3946)).

## zh

- 其他电脑重新连接时，App 不再反复向连不上的电脑发送通知设置，而是按退避间隔重试，更省电也更省流量（[#3946](https://github.com/BotHarness/DeepSeekBot/pull/3946)）。
