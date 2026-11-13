---
section: Fixed
---

## en

- Report screenshots can use native window pixels when Desktop provides the window-capture capability, avoiding page rasterization and hiding the capture toolbar. Native failures end the wait instead of retrying page capture; older Desktop versions retain their existing capture path. This requires the companion DSH Desktop source change and is not enabled in existing Desktop releases ([#4003](https://github.com/BotHarness/DeepSeekBot/pull/4003)).

## zh

- 桌面端提供原生窗口截图能力时，报告截图直接使用窗口画面，不再将网页转成图片，截图时隐藏工具栏。原生截图失败会结束等待，不再重试网页截图；旧版桌面端保留原有路径。这需要配套的 DSH Desktop 源码改动，现有桌面发行版尚未启用（[#4003](https://github.com/BotHarness/DeepSeekBot/pull/4003)）。
