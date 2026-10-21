---
section: Changed
---

## en

- The Activity Inbox, its filter menu, the home overview, the home greeting and the IM apps settings now re-render only when the data they show changes. Streamed replies, conversation updates and search typing leave all five still; other Bots' Activity no longer repaints the Inbox, its menu, the greeting or IM apps; Inbox counts no longer repaint the home overview. In a scripted 200-frame workload their combined renders on a streamed reply went from 600 to 0 and test-process CPU from about 480 ms to 8 ms ([#2453](https://github.com/BotHarness/DeepSeekBot/issues/2453), [#2454](https://github.com/BotHarness/DeepSeekBot/issues/2454), [#2455](https://github.com/BotHarness/DeepSeekBot/issues/2455)).

## zh

- Activity Inbox、它的筛选菜单、首页概览、首页问候和 IM 应用设置，只在自己显示的数据变化时才重新渲染。流式回复、会话更新和搜索输入不再让这五处重绘；其他 Bot 的 Activity 不再重绘 Inbox、筛选菜单、问候和 IM 应用；Inbox 计数不再重绘首页概览。在 200 帧的脚本负载下，流式回复时这几处的渲染合计从 600 次降到 0，测试进程 CPU 从约 480 ms 降到 8 ms（[#2453](https://github.com/BotHarness/DeepSeekBot/issues/2453)、[#2454](https://github.com/BotHarness/DeepSeekBot/issues/2454)、[#2455](https://github.com/BotHarness/DeepSeekBot/issues/2455)）。
