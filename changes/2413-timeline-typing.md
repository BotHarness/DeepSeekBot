---
section: Fixed
---

## en

- Typing in a long Bot mode conversation keeps up again. Each key used to re-render every message in the timeline, recompute Bot name colours and rebuild approval lookups for every message group; with 600 messages the median key event took about 270 ms to reach the screen. The timeline now skips messages that did not change, and the median is about 50 ms ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## zh

- 长对话里在 Bot 模式下打字不再卡顿。此前每按一个键都会重渲染时间线上的所有消息，并为每个消息组重新计算 Bot 名字颜色、重建审批查找表；600 条消息时按键事件到显示的中位数约 270 毫秒。现在未变化的消息会被跳过，中位数约 50 毫秒（[#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)）。
