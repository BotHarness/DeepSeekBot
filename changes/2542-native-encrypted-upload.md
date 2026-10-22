---
section: Fixed
---

## en

- Native phones can upload attachments over Connect when their Blob implementation lacks `arrayBuffer()`. Byte-read failures and cancellation stop the upload without plaintext fallback ([#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542)).

## zh

- 原生手机的 Blob 未提供 `arrayBuffer()` 时，也能通过 Connect 上传附件。读取失败或取消会停止上传，不会退回明文（[#2542](https://github.com/BotHarness/DeepSeekBot/issues/2542)）。
