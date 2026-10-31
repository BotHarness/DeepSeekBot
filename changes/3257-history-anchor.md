---
section: Fixed
---

## en

- Loading older chat history keeps a message as the reading anchor when the leading time separator changes ([#3257](https://github.com/BotHarness/DeepSeekBot/issues/3257)).

- Reopening a chat can load older history without waiting for a stale request; late requests no longer clear the current loading state ([#3257](https://github.com/BotHarness/DeepSeekBot/issues/3257)).

## zh

- 加载更早聊天记录时，以消息作为阅读位置锚点，避免首行时间分隔符变化导致位置跳变（[#3257](https://github.com/BotHarness/DeepSeekBot/issues/3257)）。

- 重新打开聊天后可继续加载历史，无需等待旧请求结束；旧请求返回也不会打断当前的加载状态（[#3257](https://github.com/BotHarness/DeepSeekBot/issues/3257)）。
