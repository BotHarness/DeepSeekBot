---
section: Fixed
---

## en

- Opening a long chat on iOS starts drawing at the newest message instead of first laying out older messages that are off screen. On an iPhone XS Max this halves main-thread text layout when opening a long conversation and removes the hitches when jumping back to the latest message ([#3974](https://github.com/BotHarness/DeepSeekBot/issues/3974)).

## zh

- iOS 打开长对话时直接从最新消息开始绘制，不再先排版屏幕外的旧消息。在 iPhone XS Max 上，打开长对话时主线程文本排版减半，回到最新消息时不再卡顿（[#3974](https://github.com/BotHarness/DeepSeekBot/issues/3974)）。
