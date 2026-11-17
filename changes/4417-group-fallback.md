---
section: Added
---

## en

- A Bot whose Orchestrator uses a Routing Group keeps working when its model runs out of quota, its credential is refused or it stays rate limited: it moves to the next usable model in the group and continues the reply. The chat shows one line naming the old and new model and when the old one resets, and other Bots on the group start on the next model directly. The Bot pauses only when every model in the group is unavailable, listing each one and its reset ([#4417](https://github.com/BotHarness/DeepSeekBot/issues/4417)).

## zh

- Orchestrator 使用路由组的 Bot 在模型额度用完、凭据被拒或持续限流时不再停下：它会切换到组内下一个可用模型并继续回复。聊天中显示一行提示，写明原模型、新模型以及原模型何时重置；同组的其他 Bot 会直接从下一个模型开始。只有组内所有模型都不可用时 Bot 才会暂停，并列出每个模型及其重置时间（[#4417](https://github.com/BotHarness/DeepSeekBot/issues/4417)）。
