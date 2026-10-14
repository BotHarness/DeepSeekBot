---
section: Added
---

## en

- Stop a PersonaBot while it works. In the mobile DM, the working status strip has a **Stop** button, and tapping the strip shows what each of the Bot's Sessions is doing. Stop ends the Bot's current turn, the Bot goes idle, and the conversation shows that you stopped it, also in the Web Client. Agents do the same with `deepseekbot channel-bot-stop <channel> --bot <id>`. Assignments the Bot already delegated keep running ([#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643), [#1721](https://github.com/BotHarness/DeepSeekBot/issues/1721)).

## zh

- 可以在 PersonaBot 工作时让它停下。手机私聊里的工作状态条新增 **停止** 按钮，点状态条能看到 Bot 各个 Session 正在做什么。停止会结束 Bot 当前这一轮，Bot 回到空闲，对话里会显示是你停止了它，Web 客户端同样可见。Agent 可以用 `deepseekbot channel-bot-stop <channel> --bot <id>` 做同样的事。Bot 已委派出去的 Assignment 继续运行（[#1643](https://github.com/BotHarness/DeepSeekBot/issues/1643)、[#1721](https://github.com/BotHarness/DeepSeekBot/issues/1721)）。
