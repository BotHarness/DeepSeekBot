---
section: Fixed
---

## en

- A Bot reply no longer makes every open client reload the whole Bot and conversation list. The reply's preview already updates the list, so a full reload now happens only when a slow connection had to merge a Bot reply into a later message. The phone's Inbox reloads once per burst of new messages and Bot status changes instead of once per update ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- Bot 每回复一条消息，不再让所有打开的客户端重新加载整个 Bot 和会话列表。回复本身的预览已经会更新列表，现在只有在网速慢、Bot 回复被合并到后续消息时，才会整体重新加载。手机端收件箱在连续收到新消息和 Bot 状态变化时只重新加载一次，而不是每次更新都加载（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
