---
section: Added
---

## en

- During a call with a shared camera or screen, the Bot can zoom into one tile of a grid with `call_frame` and see that keyframe at its original size, so small text on a shared screen stays readable. Originals live only in Host memory for the newest 64 tiles and are released when the call ends. `deepseekbot call-frame <message-id> <cell>` returns the same frame ([#3493](https://github.com/BotHarness/DeepSeekBot/issues/3493)).

## zh

- 共享摄像头或屏幕的通话中，Bot 可以用 `call_frame` 放大宫格里的某一格，看到该关键帧的原图，屏幕上的小字也能看清。原图只在 Host 内存中保留最近 64 格，通话结束即释放。`deepseekbot call-frame <message-id> <cell>` 返回同一张图（[#3493](https://github.com/BotHarness/DeepSeekBot/issues/3493)）。
