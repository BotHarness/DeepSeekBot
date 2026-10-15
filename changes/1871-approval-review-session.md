---
section: Changed
---

## en

- Auto approval now runs each review as its own short DeepSeek Harness session, an Approval Review Session, with only the reviewer prompt and no tools. These sessions stay out of the session list by default; turn on "Show Approval Review Sessions" in Bot settings to open one and see how a call was judged. Bot Orchestrator and Assignment sessions keep their own switch ([#1871](https://github.com/BotHarness/DeepSeekBot/pull/1871)).

## zh

- 自动审批现在把每次复核放在一个独立的 DeepSeek Harness 短会话（审批复核会话）里运行，只带复核提示词，没有任何工具。这些会话默认不在会话列表中显示；在 Bot 设置里打开「在会话列表显示审批复核会话」后，可以打开查看每次是怎么判断的。Bot 的 Orchestrator 和 Assignment 会话仍由原来的开关控制（[#1871](https://github.com/BotHarness/DeepSeekBot/pull/1871)）。
