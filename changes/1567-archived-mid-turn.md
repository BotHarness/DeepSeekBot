---
section: Fixed
---

## en

- When a Bot's Orchestrator Session is archived in DeepSeek Harness while the Bot is replying, the Bot now replays the message on a new Orchestrator Session instead of failing, as long as the interrupted turn had not acted yet ([#1567](https://github.com/BotHarness/DeepSeekBot/issues/1567)).

## zh

- Bot 回复途中其 Orchestrator 会话在 DeepSeek Harness 中被归档时，只要被打断的回合还没有对外产生任何动作，Bot 会在新的 Orchestrator 会话中重新处理这条消息，而不是直接失败（[#1567](https://github.com/BotHarness/DeepSeekBot/issues/1567)）。
