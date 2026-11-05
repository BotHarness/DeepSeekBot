---
section: Added
---

## en

- Activity can mark everything read without clearing it: **Mark all as read** in the Activity ⋯ menu on desktop and phone follows the current Bot or conversation filter and keeps replies and mentions listed (an unread-conversation entry goes away once read), and on the phone you can swipe an unread reply, mention or conversation to **Mark as read**. The phone's Clear button became a ⋯ menu that also holds the Clear actions. `deepseekbot channel-mark-all-read` now takes `--channel` or `--bot` to mark only one conversation or one Bot's conversations, reports only conversations that changed, and refuses an unknown conversation ([#3321](https://github.com/BotHarness/DeepSeekBot/issues/3321)).

## zh

- 「活动」现在可以只标为已读而不清理条目：桌面和手机「活动」的 ⋯ 菜单里新增「全部标为已读」，会按当前选中的 Bot 或会话筛选，回复和 @提及保留在列表中（「未读会话」条目读完后消失）；手机上把未读的回复、@提及或会话横滑，即可「标为已读」。手机原来的「清理」按钮改成 ⋯ 菜单，清理操作也放在里面。`deepseekbot channel-mark-all-read` 新增 `--channel` 和 `--bot`，可以只标记一个会话或某个 Bot 的会话；返回的数量只计真正变为已读的会话，未知会话会报错（[#3321](https://github.com/BotHarness/DeepSeekBot/issues/3321)）。
