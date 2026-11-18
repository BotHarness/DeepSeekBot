---
section: Changed
---

## en

- Completed Assignment reports are now batched like ordinary messages while another Assignment is still running: the Bot wakes after 10 reports or 30 seconds, whichever comes first, instead of once per report. With no other Assignment running it wakes at once; blocked, failed and question reports always wake at once ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).
- When an Assignment ends its turn without reporting, its final reply now goes to the Bot Inbox as its result and follows the normal Assignment wake policy, instead of the Assignment being marked failed ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).
- Resolving a request in the Bot Inbox also resolves the results it has already read from that request's finished Assignments and their Host completion notices, so no extra triage turn follows ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).
- The Open Inbox summary shown to the Bot each turn now adds a short status for open requests that have Assignments: each Assignment's state and its latest report ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).

## zh

- 还有其他 Assignment 在跑时，完成的 Assignment 报告现在像普通消息一样攒批：攒够 10 条或等满 30 秒就唤醒 Bot，不再每份报告唤醒一次。没有其他 Assignment 在跑时立即唤醒；阻塞、失败和提问始终立即唤醒（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
- Assignment 结束回合时如果没有汇报，它的最后一段回复会作为结果进入 Bot 收件箱，按 Assignment 的唤醒策略处理，不再判为失败（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
- 在 Bot 收件箱里处理完一个请求时，该请求下已结束的 Assignment 中 Bot 已读过的结果及其完成通知也一并处理掉，不会再多一轮整理（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
- Bot 每轮看到的未处理收件箱摘要，现在会给派了 Assignment 的请求附一句状态：各 Assignment 的状态和最新报告（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
