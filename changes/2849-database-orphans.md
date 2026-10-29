---
section: Fixed
---

## en

- A profile whose database was edited outside the app, leaving rows without their parent, opens normally again instead of hiding every Bot behind `integrity-failed`. When the database really is damaged, the error now names what SQLite found ([#2849](https://github.com/BotHarness/DeepSeekBot/issues/2849)).

## zh

- 数据库被应用外的工具修改、留下缺少上级记录的行时，现在可以正常打开，不会再因为 `integrity-failed` 让所有 Bot 消失。如果数据库确实损坏，错误信息会写明 SQLite 发现的具体问题（[#2849](https://github.com/BotHarness/DeepSeekBot/issues/2849)）。
