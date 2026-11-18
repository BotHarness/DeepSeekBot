---
section: Changed
---

## en

- The Devices page, relationship settings, relationship sync and the Bot intro's phone check now refresh when the Host announces a device or relationship change on the live stream, instead of re-reading every 2–3 seconds; they fall back to the old interval only while the live stream is down, and network routes are re-checked every 15 seconds. `deepseekbot devices-watch` observes the same device events ([#4541](https://github.com/BotHarness/DeepSeekBot/issues/4541)).

## zh

- 设备页、关系设置、关系同步和 Bot 引导里的手机检查，改为在 Host 通过实时流通知设备或关系变化时刷新，不再每 2–3 秒重新读取；只有实时流断开时才退回原来的间隔，网络路由每 15 秒检查一次。`deepseekbot devices-watch` 可以观察同样的设备事件（[#4541](https://github.com/BotHarness/DeepSeekBot/issues/4541)）。
