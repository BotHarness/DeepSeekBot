---
section: Changed
---

## en

- Channel sidebar panels now re-render only when the data they show changes. Streamed replies, composer updates, search typing, Human Inbox counts and other Bots' Activity no longer repaint every open panel; in a scripted DM and group workload the sidebar went from 2,640 and 2,400 React commits to 80 and 40 ([#2439](https://github.com/BotHarness/DeepSeekBot/issues/2439)).

## zh

- 频道侧栏面板只在自己显示的数据变化时才重新渲染。流式回复、输入框更新、搜索输入、Human Inbox 计数和其他 Bot 的 Activity 不再让所有打开的面板一起重绘；在脚本化的私聊与群聊负载下，侧栏 React commit 次数从 2,640 和 2,400 降到 80 和 40（[#2439](https://github.com/BotHarness/DeepSeekBot/issues/2439)）。
