---
section: Fixed
---

## en

- Reduced repeated layout during long Android chat replies by windowing measured Markdown blocks, preserving bubble geometry and restoring earlier content when scrolling through history ([#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)).
- Avoided repeatedly parsing completed Android Markdown and segmenting already displayed prose during append-only replies, while retaining reference definitions, corrections and joined emoji ([#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)).
- Moved Android prose's staggered text fade to a bounded native drawing clock while retaining the existing Markdown layout and playback buffer. A new native build is required; older builds retain the JavaScript fade ([#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)).

## zh

- 通过按可见区域渲染已测量的 Markdown 段落，减少 Android 长回复中的重复排版，保留气泡几何尺寸，并在查看历史时恢复早先的内容（[#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)）。
- Android 逐步追加回复时，复用已完成的 Markdown 解析和已显示文字的分字边界，避免重复处理全文，同时保留引用定义、正文修正和组合表情（[#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)）。
- 将 Android 正文的逐字淡入移到有界的原生绘制时钟，保留原有 Markdown 排版与播放缓冲。需要重新构建原生应用；旧构建继续使用 JavaScript 淡入（[#2028](https://github.com/BotHarness/DeepSeekBot/issues/2028)）。
