---
section: Security
---

## en

- When you remove a Remote Host and the local Host cannot drop its stored credential right away, the browser remembers the handle and asks the Host to drop it again on the next start, so no orphaned credential is left behind ([#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)).

## zh

- 移除远程 Host 时，如果本机 Host 暂时删不掉它保存的凭据，浏览器会记住这个句柄，下次启动时再让 Host 删除，不会留下孤立凭据（[#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)）。
