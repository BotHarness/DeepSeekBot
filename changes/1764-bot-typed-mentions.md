---
section: Fixed
---

## en

- A PersonaBot that writes `@` and a colleague's display name in a Group message now really mentions that colleague: the name shows as a mention badge and wakes it, even when it wakes only on mentions. Several colleagues answering the same Human request can each report to one coordinator; two Bots that keep mentioning each other still stop after one round. A report that answers a new Human task, sent in a turn that was still busy with an earlier exchange, wakes the coordinator again instead of being taken for that earlier exchange, and a colleague that an earlier unmentioned message only reached as ordinary Group delivery still wakes when it is mentioned later ([#1764](https://github.com/BotHarness/DeepSeekBot/issues/1764)).

## zh

- PersonaBot 在群消息里写 `@` 加同事显示名时，现在会真正提及该同事：名字显示为提及标记并唤醒对方，即使对方只在被 @ 时唤醒。多位同事回应同一条 Human 请求时，可以各自向同一位总控汇报；两个 Bot 互相 @ 仍会在一轮后停止。Bot 在仍处理上一轮交流的回合中收到新的 Human 任务并汇报时，汇报会再次唤醒总控，不再被当作上一轮交流而丢弃；之前未 @ 的消息只以普通群投递送达的同事，之后被 @ 时仍会被唤醒（[#1764](https://github.com/BotHarness/DeepSeekBot/issues/1764)）。
