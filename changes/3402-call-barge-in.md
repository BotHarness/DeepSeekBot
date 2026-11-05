---
section: Changed
---

## en

- You can now cut in while a Bot talks on a call: its voice drops right away when you start speaking and stops once it is clear you are talking, and what you say goes to the chat. Coughs, knocks, short noise, a murmured "嗯" and the Bot's own voice from the speaker do not interrupt it. An interrupted reply keeps only what you heard as its voice bar. `deepseekbot call-simulate` can script a barge-in with an `"after": "playing"` step and reports `bargeIns` ([#3402](https://github.com/BotHarness/DeepSeekBot/issues/3402)).

## zh

- 通话中 Bot 说话时可以直接插话：你一开口它的音量就降低，确认是你在说话后停止播放，你说的话会进入聊天。咳嗽、敲击、短噪声、一声“嗯”以及扬声器里 Bot 自己的声音都不会打断它。被打断的回复只把你听到的部分存成语音条。`deepseekbot call-simulate` 可以用 `"after": "playing"` 步骤模拟插话，并报告 `bargeIns`（[#3402](https://github.com/BotHarness/DeepSeekBot/issues/3402)）。
