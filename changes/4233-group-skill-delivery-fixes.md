---
section: Fixed
---

## en

- Fixed oversized Skill snapshots blocking ordinary Group delivery by showing an excerpt and directing Bots to the complete snapshot through `channel_read` with its Channel and message IDs; the shared harvest budget allows only one oversized row and leaves omitted messages pending. Active Group mention steering now includes the full Skill snapshot ([#4233](https://github.com/BotHarness/BotHarness/issues/4233)).

## zh

- 修复大型 Skill 快照阻塞群聊普通消息投递的问题，改为显示摘录并提示通过 `channel_read` 按群聊和消息 ID 读取完整快照；共享收集预算仅允许首条消息超限，未展示的消息保持待处理。群聊 @ 消息引导正在运行的 Bot 时也会附上完整 Skill 快照（[#4233](https://github.com/BotHarness/BotHarness/issues/4233)）。
