---
section: Fixed
---

## en

- The channel list finds each channel's latest message with one indexed lookup, even when a Bot has posted thousands of notices since; the Bot list no longer reads every message to find each Bot's latest activity, the attention summary no longer scans every Inbox Admission to find ones that need repair, and reopening timed question cards at startup no longer scans every message ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 即使 Bot 之后发了成千上万条通知，频道列表也只用一次索引查找就能拿到每个频道的最新消息；Bot 列表不再为了找出每个 Bot 的最近活动而读取全部消息；提醒汇总不再为了找出需要修复的收件项而扫描全部收件记录；启动时恢复限时提问卡片也不再扫描全部消息（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
