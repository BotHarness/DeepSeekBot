---
section: Changed
---

## en

- The context breakdown in the composer now counts Group digests, Group mentions, DM and external items and the harvest summary as Inbox content instead of Human messages, and shows unresolved Inbox reminders as their own row. With telemetry on, the Host also reports each Bot turn's token usage and context breakdown, without any message text. External messages in the Bot Inbox now state the reply rules once and drop fields the line already shows, so a wake with external messages costs about a fifth less ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).

## zh

- 输入框的上下文占用明细现在把群聊汇总、群聊 @、私信和外部消息条目以及收件箱汇总算作收件箱内容，不再算成 Human 消息；未处理收件箱的提醒单独显示一行。开启遥测时，Host 还会上报每一轮 Bot 回合的 token 用量和上下文占用明细，不含任何消息内容。收件箱里的外部消息现在只写一次回复规则，并去掉条目里已经出现过的字段，含外部消息的一次唤醒成本约降低五分之一（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
