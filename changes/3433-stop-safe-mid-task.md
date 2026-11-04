---
section: Changed
---

## en

- Stopping a Bot is now safe at any point of its turn. A half-written reply is discarded with the "Reply interrupted and not sent" note, its held Group drafts can no longer be recovered, and an external IM send with an unknown outcome is never retried. A tool call that was still running is recorded with an unknown result, and the Bot's next turn is told to check it before redoing anything. Open approval cards of the stopped Session close as "Session stopped" on desktop and mobile. An Assignment the stopped turn was still creating is stopped too, and a stop that has not settled after 30 seconds discards the run ([#3433](https://github.com/BotHarness/DeepSeekBot/issues/3433)).

## zh

- 现在无论 Bot 的回合进行到哪一步，停止都是安全的。写到一半的回复会被丢弃，并显示“回复已中断，未发送”；被扣下的群聊草稿无法再恢复；结果未知的外部 IM 发送不会自动重试。仍在运行的工具调用会被记为结果未知，Bot 下一轮会被提醒先核实再决定是否重做。被停止会话的待审批卡片在桌面端和移动端都会关闭并显示“会话已停止”。停止时正在创建的 Assignment 也会一并停止；30 秒内仍未停下的运行会被直接丢弃（[#3433](https://github.com/BotHarness/DeepSeekBot/issues/3433)）。
