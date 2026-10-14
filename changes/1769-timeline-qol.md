---
section: Added
---

## en

- Opening a conversation with unread replies now shows a New messages divider at your last-read point, switching conversations keeps the message you were reading, long messages fold behind Show all, each grouped message shows its own time on hover, images open in an in-page preview you can step through with the arrow keys, you can react to a message with an emoji from its hover bar or, on a phone, its long-press menu, and Bots can react too by passing `react_to` and `reaction` to `channel_send`, with or without a reply in the same call (Bots see the reactions when they read the Channel, and `deepseekbot channel-react` adds yours), and Ctrl/⌘+F searches the open conversation and jumps to a match (`deepseekbot channel-search` runs the same search) ([#1769](https://github.com/BotHarness/DeepSeekBot/pull/1769)).

## zh

- 打开有未读回复的会话时，会在上次读到的位置显示「以下为新消息」分隔线；切换会话后回来仍停在原来读到的消息；过长的消息默认折叠，可点「展开全部」；同组的每条消息悬停时显示自己的时间；图片在页面内预览，可用左右方向键切换；可以从消息的悬停操作栏添加表情回应，手机上长按消息也能回应，Bot 也能在 `channel_send` 里传 `react_to` 和 `reaction` 回应，可以同一次调用里顺带回复（Bot 读取会话时能看到这些回应，`deepseekbot channel-react` 可以添加你的回应）；按 Ctrl/⌘+F 可搜索当前会话并跳到匹配的消息（`deepseekbot channel-search` 执行同样的搜索）（[#1769](https://github.com/BotHarness/DeepSeekBot/pull/1769)）。
