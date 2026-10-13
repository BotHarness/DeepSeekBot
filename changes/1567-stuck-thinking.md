---
section: Fixed
---

## en

- A Bot no longer stays stuck on "thinking" or "working" when a Session log stops in the middle of a turn, for example after a crash or when the turn ends without a closing event. The state now settles to idle once DeepSeek Harness reports that the Session is not running ([#1567](https://github.com/BotHarness/DeepSeekBot/issues/1567)).

## zh

- 会话日志停在回合中途时（例如崩溃后，或回合结束但没有写入结束事件），Bot 不会再一直显示「正在思考」或「正在工作」。只要 DeepSeek Harness 报告这个会话已经不在运行，状态就会回到空闲（[#1567](https://github.com/BotHarness/DeepSeekBot/issues/1567)）。
