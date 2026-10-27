---
section: Changed
---

## en

- In the desktop app, Bot replies now appear once they are complete, while the conversation header shows what the Bots are doing. Turn on **Settings → Messaging → Stream Bot replies as they are written** (or `streamReplies` through `deepseekbot settings-set botharness-client`) to see the text as it is written. New messages scale into the list. In a Group, a new speaker's avatar and name arrive with the first message, and when the same Bot sends another message the avatar slides down to it instead of jumping. The reading indicator and reaction chips scale in when they appear and scale down and fade out when they go away. The Bot working status moves from the bottom of the message list to the header, so it no longer shifts the list: a Bot DM shows it in place of the Bot's name, and a Group shows up to three stacked avatars of the working Bots with their status after the Group name. The status line above the message box is gone, since the header now carries it ([#2871](https://github.com/BotHarness/DeepSeekBot/issues/2871)).

## zh

- 桌面端 Bot 回复改为写完整后再显示，写作期间由会话顶部 header 显示 Bot 在做什么。如需逐字查看，可在**设置 → 消息 → 逐字显示 Bot 回复**开启（或通过 `deepseekbot settings-set botharness-client` 设置 `streamReplies`）。新消息出现时有缩放入场动画；群聊里换人发言时，头像和名字随第一条消息一起入场，同一 Bot 连发时头像会滑到最新一条旁边而不是跳过去；正在阅读提示和 reaction chip 出现时缩放入场，消失时缩小淡出。Bot 工作状态从消息列表底部移到顶部 header，不再让列表跳动：Bot 私聊用它替换 Bot 名称，群聊在群名后显示最多三个正在工作的 Bot 叠放头像和状态。消息输入框上方的状态栏随之移除（[#2871](https://github.com/BotHarness/DeepSeekBot/issues/2871)）。
