---
section: Changed
---

## en

- When several Assignments started for one request finish close together, the Bot now wakes once for all of their results instead of once per Assignment. A finished result waits up to 15 seconds for its sibling Assignments; blocked, failed and question reports still wake at once ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).
- An Assignment that ends its turn without reporting is asked once to report before it is marked failed, so its result still reaches the Bot ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).
- Resolving a request in the Bot Inbox also resolves the results it has already read from that request's finished Assignments and their Host completion notices, so no extra triage turn follows ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).

## zh

- 同一个请求派出的多个 Assignment 先后很快完成时，Bot 现在只唤醒一次处理全部结果，不再每完成一个就唤醒一次。完成的结果最多等其他 Assignment 15 秒；阻塞、失败和提问仍然立即唤醒（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
- Assignment 结束回合时如果没有汇报，会先被要求补一次汇报再判为失败，结果仍能交到 Bot 手上（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
- 在 Bot 收件箱里处理完一个请求时，该请求下已结束的 Assignment 中 Bot 已读过的结果及其完成通知也一并处理掉，不会再多一轮整理（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
