---
section: Fixed
---

## en

- A Bot turn that DeepSeekBot itself started (a Human message, schedule or Assignment wake) is no longer rejected with "Native Orchestrator input is unavailable" when a secondary check such as the current-Session lookup disagrees mid-turn; the mismatch is recorded in the diagnostic log instead ([#3315](https://github.com/BotHarness/DeepSeekBot/issues/3315)).

## zh

- DeepSeekBot 自己发起的 Bot 回合（用户消息、定时或 Assignment 唤醒）不再因为当前会话判定等次要检查在回合中途不一致而报错「Native Orchestrator input is unavailable」，不一致会改为记录在诊断日志中（[#3315](https://github.com/BotHarness/DeepSeekBot/issues/3315)）。
