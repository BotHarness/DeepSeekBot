---
section: Fixed
---

## en

- Long Bot mode conversations use far less memory and CPU. Message groups far from the viewport are no longer mounted; a spacer keeps their exact height, so scrolling does not jump. With 600 messages loaded, the page holds about 11 messages instead of 600, the heap dropped from about 93 MB to about 42 MB, and idle main-thread time with one running animation dropped from about 13% to about 10% ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## zh

- 长对话的内存和 CPU 占用进一步下降。离视口较远的消息组不再挂载，用等高占位保留原有高度，滚动不会跳动。加载 600 条消息时，页面只挂载约 11 条，堆内存从约 93 MB 降到约 42 MB，有一个持续动画时空闲主线程占用从约 13% 降到约 10%（[#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)）。
