---
section: Added
---

## en

- When a Bot running on Codex wants to run a command or change a file that needs permission, you now get the same approval card as for any other tool. Approve lets Codex go on, Deny tells Codex no, and "Always allow" saves a rule for that Codex tool that shows up with your other approval rules. Session detail says the engine is waiting for your approval while the card is open, and `deepseekbot engine approvals` lists the open cards so `tool-approval-decide` can answer them ([#4487](https://github.com/BotHarness/DeepSeekBot/issues/4487)).

## zh

- 运行在 Codex 上的 Bot 要执行需要许可的命令或改文件时，现在会弹出和其他工具一样的审批卡片。批准后 Codex 继续，拒绝会告诉 Codex 不行，“始终允许”会为这个 Codex 工具保存一条规则，和其他审批规则列在一起。卡片打开时，Session 详情会显示引擎在等你批准；`deepseekbot engine approvals` 列出这些卡片，可以用 `tool-approval-decide` 回答（[#4487](https://github.com/BotHarness/DeepSeekBot/issues/4487)）。
