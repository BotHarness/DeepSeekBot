---
section: Fixed
---

## en

- The desktop client re-renders less: the conversation view, sidebars, Activity menu and onboarding screens now update only when the data they show changes, not on every store write such as a streamed reply. The Host also finds unanswered private input requests at startup through an index instead of reading every Bot DM's history, and the sidebar no longer re-reads attention status every 10 seconds on top of live updates ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 桌面客户端的重新渲染更少了：会话视图、侧栏、活动菜单和引导页面现在只在自己显示的数据变化时才更新，不再随每一次状态写入（例如流式回复）重新渲染。Host 启动时也改为通过索引查找未回复的私密输入请求，不再逐个读取所有 Bot 私聊的历史；侧栏在已有实时更新的情况下，也不再每 10 秒重复读取一次提醒状态（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
