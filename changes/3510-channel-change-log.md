---
section: Added
---

## en

- The Host now records every change to a message a client can see, such as reactions, read state, delivery state, voice results, purges and attachment changes, in one change log. Apps can ask for what changed in a Channel since their last position with `deepseekbot channel-changes`, instead of reloading the whole history; a stale or pruned position asks the app to resync ([#3510](https://github.com/BotHarness/DeepSeekBot/issues/3510)).

## zh

- Host 现在把客户端能看到的每一种消息变化（表情回应、已读、投递状态、语音结果、清除内容、附件变化）记入同一份变化日志。App 可以用 `deepseekbot channel-changes` 只拉取某个频道自上次位置以来的变化，不必重新加载全部历史；位置过旧或已被清理时会要求 App 重新同步（[#3510](https://github.com/BotHarness/DeepSeekBot/issues/3510)）。
