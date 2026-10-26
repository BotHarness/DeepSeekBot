---
section: Fixed
---

## en

- A long Bot mode conversation costs far less CPU while something on screen animates. Message groups far from the viewport now skip style, layout and paint while keeping their exact height, and their avatars stop tracking visibility; with 600 messages and one running animation, idle main-thread time dropped from about 25% to about 14% ([#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)).

## zh

- 长对话在屏幕上有动画时的 CPU 占用大幅下降。离视口较远的消息组现在跳过样式、布局和绘制，同时保留原有高度，组内头像也不再追踪可见性；600 条消息加一个持续动画时，空闲主线程占用从约 25% 降到约 14%（[#2413](https://github.com/BotHarness/DeepSeekBot/issues/2413)）。
