---
section: Changed
---

## en

- A PersonaBot that leaves Bot Inbox items open after a turn is woken again to triage them: act, resolve, snooze or ignore each one. It stops once a round makes no progress and starts again only when something new opens. When an Assignment reports completed, the PersonaBot checks the result against what it asked for and sends it back if it falls short ([#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)).

## zh

- PersonaBot 回合结束后如果还有未处理的 Bot Inbox 条目，会被再次唤醒去分拣：处理、resolve、snooze 或忽略。某一轮没有进展就停止，直到有新的条目进来才再次开始。Assignment 汇报完成时，PersonaBot 会对照当初的要求验收，不合格就打回（[#1561](https://github.com/BotHarness/DeepSeekBot/issues/1561)）。
