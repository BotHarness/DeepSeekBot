---
section: Fixed
---

## en

- A Bot no longer gets stuck answering every message with "Orchestrator Session permission differs from this PersonaBot's access setting". When DSH had already resumed the Bot's chat Session on its own (after a Host restart, for example) and full access had been switched since the Session last ran, the Host refused to take the Session over before it could put the Session back on the switch, so every later message, and compact-and-retry, failed the same way. The Host now aligns the Session to the switch first, as it does before every step.

## zh

- Bot 不会再卡在每条消息都回复「Orchestrator Session permission differs from this PersonaBot's access setting」。如果 DSH 已经自行恢复了 Bot 的聊天会话（例如 Host 重启之后），而这个会话上次运行后「完全访问」开关被切换过，Host 会在把会话权限对齐到开关之前就拒绝接管，之后每条消息以及「压缩后重试」都会同样失败。现在 Host 会先把会话对齐到开关，再做校验，与每一步开始前的处理一致。
