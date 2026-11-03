---
section: Fixed
---

## en

- Importing a Bot from the Bot Marketplace on Windows no longer fails with `EPERM` on a `tobs-install-review` temp folder. The review clone's read-only Git files are now cleared before removal, and a temp folder Windows still holds on to no longer fails the import ([#3294](https://github.com/BotHarness/DeepSeekBot/issues/3294)).

## zh

- Windows 上从 Bot 市场导入 Bot 不会再因 `tobs-install-review` 临时目录报 `EPERM` 而失败。审查用的克隆里只读的 Git 文件会先去掉只读再删除；即使 Windows 仍占着临时目录，也不会让导入失败（[#3294](https://github.com/BotHarness/DeepSeekBot/issues/3294)）。
