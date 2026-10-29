---
section: Fixed
---

## en

- Bots recover when a tool-less request starts a declaration series and tools return on the next turn, instead of repeatedly failing with HTTP 400 because every tool is deferred; existing affected Sessions recover without clearing their history ([#3137](https://github.com/BotHarness/DeepSeekBot/issues/3137)).

## zh

- 修复无工具请求开启声明序列后，下一轮恢复工具却因全部工具被延迟加载而反复报 HTTP 400 的问题；已有受影响会话可继续运行，无需清空历史（[#3137](https://github.com/BotHarness/DeepSeekBot/issues/3137)）。
