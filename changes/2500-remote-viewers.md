---
section: Added
---

## en

- Open a Remote Host Bot's Browser or Computer viewer from its conversation, pause the Bot to send input, and release control when the viewer closes. Resuming the Bot or losing frames discards queued input; recovered frames require another explicit takeover. Shared viewers recover unchanged screens after a connection failure, and Web errors offer localized recovery guidance. Removing a Host waits up to five seconds for viewer cleanup before revoking the pairing. The viewers reuse the paired-device frame and input routes ([#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500)).

## zh

- 可从远程 Bot 对话打开浏览器或共享桌面画面，暂停 Bot 后操作，关闭画面时交还控制权。恢复 Bot 或画面失联会丢弃排队输入；画面恢复后须重新明确接管。共享查看器可在连接故障后恢复未变化的画面，网页错误提示提供本地化恢复建议。移除 Host 时先等待画面释放控制，最多五秒，再撤销配对。画面与输入复用已配对设备的接口（[#2500](https://github.com/BotHarness/DeepSeekBot/issues/2500)）。
