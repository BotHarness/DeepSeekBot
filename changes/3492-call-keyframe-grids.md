---
section: Added
---

## en

- Calls can share what the Human sees: a client sends keyframes from the camera or screen, and each spoken sentence reaches the Bot with one image tiled from the keyframes of that sentence (a single frame, or a 2x2, 3x3 or 4x4 grid labelled in time order). A sentence with nothing new on screen says so instead of sending the same picture again. `deepseekbot call-simulate --video` or `--screen` plays a video file or a folder of frames into a simulated call and reports the keyframe and grid timings ([#3492](https://github.com/BotHarness/DeepSeekBot/issues/3492)).

## zh

- 通话可以共享 Human 看到的画面了：客户端从摄像头或屏幕发送关键帧，每句话发给 Bot 时附带一张由这句话期间的关键帧拼成的图片（单张，或按时间顺序标号的 2x2、3x3、4x4 宫格）。画面没有变化时只说明“与上一张一致”，不重复发图。`deepseekbot call-simulate --video` 或 `--screen` 可以把视频文件或一组帧图片放进模拟通话，并报告关键帧和宫格图的耗时（[#3492](https://github.com/BotHarness/DeepSeekBot/issues/3492)）。
