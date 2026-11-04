---
section: Added
---

## en

- Stop a Bot's Orchestrator from its row in the Sessions panel, just like an Assignment. It interrupts only the current turn; the next message or Assignment Report wakes it as usual. When Assignments are running, the panel asks first and can stop them too. Bot Stop stops every running Session of a Bot at once; IM `/stop` now does this, and agents use `deepseekbot bot-stop <bot>`. Every Assignment stopped by a Human, alone or by Bot Stop, can be resumed with a new Assignment Request. The stop notice names what was stopped and appears only in the conversation you stopped it from. `deepseekbot channel-bot-stop` is deprecated in favour of `bot-stop` ([#3429](https://github.com/BotHarness/DeepSeekBot/issues/3429)).

## zh

- 现在可以像停止 Assignment 一样，在 Sessions 面板中从 Orchestrator 那一行单独停止它。停止只打断当前这一轮；下一条消息或 Assignment 汇报会照常唤醒它。如果有正在运行的 Assignment，面板会先询问，并可一并停止。Bot Stop 一次停止 Bot 的所有运行中 Session；IM 的 `/stop` 现在执行它，Agent 使用 `deepseekbot bot-stop <bot>`。被 Human 停止的 Assignment（无论单独停止还是经由 Bot Stop）都可以用新的 Assignment Request 继续。停止通知会写明停止了什么，并且只出现在你发起停止的对话中。`deepseekbot channel-bot-stop` 已弃用，请改用 `bot-stop`（[#3429](https://github.com/BotHarness/DeepSeekBot/issues/3429)）。
