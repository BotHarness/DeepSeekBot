---
section: Fixed
---

## en

- "New Session" and moving Memory now work when the Bot's first Turn failed before its Session was saved, for example on a model-route error. Before, both failed with a generic error in exactly the state where the Human needed them. Compact-and-retry on such a Session now says there is nothing to compact and points to "New Session" ([#2992](https://github.com/BotHarness/DeepSeekBot/issues/2992)).

## zh

- 当 Bot 的第一轮在 Session 落盘之前就失败（例如模型路由错误）时，“新会话”和移动 Memory 现在可以正常工作。此前两者在最需要它们的状态下都只报通用错误。对这种 Session 执行压缩并重试，现在会说明没有可压缩的内容，并引导使用“新会话”（[#2992](https://github.com/BotHarness/DeepSeekBot/issues/2992)）。
