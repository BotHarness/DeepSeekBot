---
section: Fixed
---

## en

- Reject incomplete Soniox recognition when the connection closes before finalization, instead of sending a truncated sentence as a successful result ([#3631](https://github.com/BotHarness/DeepSeekBot/issues/3631)).

## zh

- Soniox 在完成确认前断开连接时，明确报告识别失败，避免把截断的句子当作完整结果发送（[#3631](https://github.com/BotHarness/DeepSeekBot/issues/3631)）。
