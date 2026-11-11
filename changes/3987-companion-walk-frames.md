---
section: Fixed
---

## en

- The Window Companion no longer re-renders on every animation frame while it walks: its movement is drawn directly, which frees about a fifth of the main-thread script time while scrolling chat history ([#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)).
- Scrolling chat history no longer re-renders the whole conversation on every scroll event, which cuts main-thread script time while scrolling by about a third ([#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)).

## zh

- 桌宠走动时不再每一帧都重新渲染，移动改为直接绘制，滚动聊天历史时主线程脚本时间减少约五分之一（[#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)）。
- 滚动聊天历史时不再在每次滚动事件里重新渲染整个对话，滚动时主线程脚本时间再减少约三分之一（[#3987](https://github.com/BotHarness/DeepSeekBot/pull/3987)）。
