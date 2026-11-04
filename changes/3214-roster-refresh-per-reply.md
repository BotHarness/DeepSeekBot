---
section: Fixed
---

## en

- A Bot reply no longer makes every open client reload the whole Bot and conversation list. The reply's preview already updates the list, so a full reload now happens only when a slow connection had to merge a Bot reply into a later message. The phone's Inbox no longer reloads on Bot status changes, and it reloads once per burst of new messages instead of once per message ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- Bot 每回复一条消息，不再让所有打开的客户端重新加载整个 Bot 和会话列表。回复本身的预览已经会更新列表，现在只有在网速慢、Bot 回复被合并到后续消息时，才会整体重新加载。手机端收件箱不再因为 Bot 状态变化而重新加载，连续收到多条新消息时也只重新加载一次，而不是每条一次（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
