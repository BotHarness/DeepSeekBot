---
section: Fixed
---

## en

- Typing in a long Bot mode conversation keeps up again. Each key used to re-render every message in the timeline, recompute Bot name colours and rebuild approval lookups for every message group; with 600 messages a key took about 270 ms to appear. The timeline now skips messages that did not change, and a key takes about 50 ms ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## zh

- 长对话里在 Bot 模式下打字不再卡顿。此前每按一个键都会重渲染时间线上的所有消息，并为每个消息组重新计算 Bot 名字颜色、重建审批查找表；600 条消息时一个字要约 270 毫秒才显示出来。现在未变化的消息会被跳过，每个键约 50 毫秒（[#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)）。
