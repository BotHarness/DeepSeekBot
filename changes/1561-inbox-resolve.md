---
section: Changed
---

## en

- A PersonaBot no longer treats every message as handled just because a turn finished. Items that reached it stay open until it resolves them, it sees its unresolved conversations at the start of each turn, and it can review them with `inbox_list` and clear many at once with `inbox_resolve`. The Bot Inbox view shows these items as Open ([#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)).

## zh

- PersonaBot 不再因为一轮 turn 结束就把所有消息当作已处理。进入它 inbox 的条目会保持「待办」，直到它自己 resolve；每轮开始时它会看到尚未处理完的对话，并能用 `inbox_list` 查看、用 `inbox_resolve` 一次性批量处理。Bot Inbox 视图把这些条目显示为「待办」（[#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)）。
