---
section: Fixed
---

## en

- The development-client `phone-notifications` command explicitly waits for the phone owner's asynchronous result on Hermes and rejects Promise internals instead of reporting them as success. Timed-out writes still require readback before retrying ([#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500)).

## zh

- development client 的 `phone-notifications` 命令显式等待 Hermes 中手机 owner 的异步结果，拒绝将 Promise 内部字段误报为成功；写入超时后仍须先读回再决定是否重试（[#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500)）。
