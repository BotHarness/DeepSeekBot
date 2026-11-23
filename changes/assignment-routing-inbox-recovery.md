---
section: Fixed
---

## en

- Fixed Assignment routing and execution races that could leave a wake pending, lose an approval wait, or start work on an invalid route. Inbox harvests now release claimed messages after an observation error and honor Group digest retry delays ([#4961](https://github.com/BotHarness/DeepSeekBot/issues/4961)).

## zh

- 修复 Assignment 路由和执行中的竞态，避免唤醒一直等待、审批等待丢失，或使用无效路由启动任务。Inbox 收取消息时如果写入观察记录失败，会释放已认领的消息，并遵守群聊摘要的重试间隔（[#4961](https://github.com/BotHarness/DeepSeekBot/issues/4961)）。
