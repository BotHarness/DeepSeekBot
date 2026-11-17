---
section: Fixed
---

## en

- Fixed every PersonaBot reply waiting for a Human approval card: a `bot_send_message` reply to its own Source Event is admitted directly again, while proactive sends to another Channel, Human, Bot or external target still need approval.

## zh

- 修复了 PersonaBot 每次回复都要等 Human 审批卡的问题：`bot_send_message` 回复自身 Source Event 时重新直接放行；主动发往其他 Channel、Human、Bot 或外部目标仍需审批。
