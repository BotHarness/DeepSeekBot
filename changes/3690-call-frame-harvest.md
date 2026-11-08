---
section: Changed
---

## en

- A call no longer drops camera or screen frames when the picture moves fast: each spoken sentence carries the newest 9 frames, and every older frame is saved to the DM in order as a frame record of up to 9, written before the sentence it came before. Sentences now note when they were spoken and what time range their picture covers (for example "this message 1:06–1:20, picture 0:58–1:20"), so the Bot can read back earlier frames by call time. A sentence with nothing new points at the last picture instead of sending it again. `deepseekbot call-simulate --video/--screen` reports frame records, frames per sentence and any frames dropped by the safety limit under `visual.harvest`; the old record list on call messages is removed ([#3690](https://github.com/BotHarness/DeepSeekBot/issues/3690)).

## zh

- 通话中画面变化很快时不再丢摄像头或屏幕的帧：每句话带最新的 9 帧，更早的帧按时间顺序每至多 9 帧存为一条画面记录，并在对应句子之前写入 DM。句子消息现在记下说话时段和画面时段（例如“this message 1:06–1:20, picture 0:58–1:20”），Bot 可以按通话时间读回更早的画面。没有新画面的句子会指向上一张，不再重发。`deepseekbot call-simulate --video/--screen` 在 `visual.harvest` 下报告画面记录、每句带图帧数和兜底上限丢掉的帧数；通话消息上旧的记录名单已移除（[#3690](https://github.com/BotHarness/DeepSeekBot/issues/3690)）。
