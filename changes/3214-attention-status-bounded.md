---
section: Fixed
---

## en

- The unread badge and attention status no longer slow down as conversations grow: they read only the messages after each Channel's read position, and model usage updates no longer recompute the attention summary. Looking up a Session's child Sessions and a request's Bot replies no longer scans every row ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 未读角标和提醒状态不再随会话变长而变慢：现在只读取每个频道已读位置之后的消息，模型用量更新也不再触发提醒汇总重算。查找会话的子会话、查找某条请求对应的 Bot 回复，也不再逐行扫描全表（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
