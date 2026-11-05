---
section: Fixed
---

## en

- A Bot turn no longer makes the Host recompute attention and notify every client once per database write. Attention updates and change signals are now combined over a short window, with a firm upper bound so updates are never held back for long, and the shared Bot activity snapshot is built once per change for all connected clients instead of once per client. Push and Live Activity updates keep a 2-second upper bound during sustained activity ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- Bot 运行一个回合时，Host 不再每写一次数据库就重算一次提醒、通知一次所有客户端。提醒更新和变更信号现在会在很短的时间窗口内合并，并设有等待上限，不会被长时间压住；共享的 Bot 活动快照每次变化只生成一次，供所有连接的客户端共用，不再每个客户端各生成一次。持续活动时，推送和 Live Activity 的更新最多延后 2 秒（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
