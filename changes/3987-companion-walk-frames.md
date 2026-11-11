---
section: Fixed
---

## en

- The Window Companion no longer re-renders on every animation frame while it walks: its movement is drawn directly, which frees about a fifth of the main-thread script time while scrolling chat history ([#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)).

## zh

- 桌宠走动时不再每一帧都重新渲染，移动改为直接绘制，滚动聊天历史时主线程脚本时间减少约五分之一（[#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)）。
