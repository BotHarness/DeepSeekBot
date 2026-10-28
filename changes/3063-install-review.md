---
section: Added
---

## en

- Tob now reviews a Bot from the Bot Marketplace before it is installed, for both GitHub and uploaded listings: the install step lists any prompt injection, instructions to send data out, and scripts it found, and nothing is created until you continue. If Tob cannot review (no model or an error), the step says so and you may install anyway. `marketplace-install` prints the review first and installs with `--review <id> --confirm` ([#3063](https://github.com/BotHarness/DeepSeekBot/issues/3063)).

## zh

- 从 Bot 市场安装 Bot 前，Tob 会先检查它的文件（GitHub 条目和上传的 Bot 都会）：安装这一步列出发现的指令注入、把数据发到外部的指令和脚本，在你确认继续之前不会创建任何东西。Tob 没法检查时（没有模型或出错），这一步会说明，你仍可以选择安装。`marketplace-install` 先输出检查结果，再用 `--review <id> --confirm` 安装（[#3063](https://github.com/BotHarness/DeepSeekBot/issues/3063)）。
