---
section: Changed
---

## en

- Bot calls answer sooner: a short "嗯" plays as soon as you stop talking, and the Bot starts speaking its first sentence while the rest of the reply is still being written instead of after the whole reply. A reply the Bot drops mid-way stops at once, and the voice bar kept in the chat holds exactly what you heard. `deepseekbot call-simulate` now reports `ackMs`, `firstTextMs` and per-reply timings ([#3401](https://github.com/BotHarness/DeepSeekBot/issues/3401)).

## zh

- Bot 通话响应更快：你说完后立刻听到一声短的“嗯”，Bot 写出第一句就开始说，不再等整条回复写完。Bot 中途放弃的回复会立即停止，聊天里保留的语音条和你听到的内容完全一致。`deepseekbot call-simulate` 现在会报告 `ackMs`、`firstTextMs` 和每条回复的耗时（[#3401](https://github.com/BotHarness/DeepSeekBot/issues/3401)）。
