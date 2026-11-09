---
section: Changed
---

## en

- Camera and screen sharing in calls now pick keyframes by picture structure (a perceptual hash) instead of the average pixel change, plus a local check on screens: a single typed line or a page turn now reaches the Bot, a playing video sends one keyframe per shot instead of one every two seconds, and camera noise or a small brightness change no longer sends a picture. `node scripts/call-keyframe-eval.mjs` runs six end-to-end cases (reading, scrolling code, switching windows, a film clip, holding things up to the camera, five silent minutes) and judges each automatically ([#3499](https://github.com/BotHarness/DeepSeekBot/issues/3499)).

## zh

- 通话里的摄像头和屏幕共享改为按画面结构（感知哈希）挑关键帧，不再看平均像素变化，屏幕共享另加一道局部检查：只多打了一行字或翻了一页，Bot 现在也能看到；播放视频时每个镜头发一帧，不再每两秒发一帧；摄像头噪点或亮度的小幅变化不再触发发图。`node scripts/call-keyframe-eval.mjs` 会跑六个端到端用例（读文档、滚动代码、切窗口、看电影片段、在镜头前举东西、沉默五分钟）并自动判定结果（[#3499](https://github.com/BotHarness/DeepSeekBot/issues/3499)）。
