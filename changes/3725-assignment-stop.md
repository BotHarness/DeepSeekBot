---
section: Fixed
---

## en

- Stopping an Assignment from the phone, Sessions panel, or `session-stop` now really stops it: a further Assignment Request is refused while it stays stopped instead of silently resuming it, so in-flight Orchestrator rounds wind down instead of redispatching the stopped work. After an explicit Human instruction to continue, call `unarchive_assignment` first and then send the request again ([#3725](https://github.com/BotHarness/DeepSeekBot/issues/3725)).

## zh

- 从手机、Sessions 面板或 `session-stop` 停止 Assignment 现在会真正停下来：在保持停止期间，新的 Assignment Request 会被拒绝，而不再悄悄恢复它，飞行中的 Orchestrator 轮次会收尾而不是重新派发已停止的工作。Human 明确指示继续后，先调用 `unarchive_assignment`，再重新发送请求 ([#3725](https://github.com/BotHarness/DeepSeekBot/issues/3725))。
