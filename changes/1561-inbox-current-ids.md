---
section: Fixed
---

## en

- A PersonaBot can now resolve or snooze the message that woke it in the same turn: `inbox_resolve` and `inbox_snooze` accept the Message ID shown in the turn header, and `inbox_list` includes the items the current turn is handling. Before, the Bot could not find those items, so every message cost an extra triage turn ([#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)).

## zh

- PersonaBot 现在可以在同一轮里 resolve 或 snooze 唤醒它的那条消息：`inbox_resolve` 和 `inbox_snooze` 接受回合标题里显示的 Message ID，`inbox_list` 也会列出本轮正在处理的条目。之前 Bot 找不到这些条目，导致每条消息都要多跑一轮分拣（[#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)）。
