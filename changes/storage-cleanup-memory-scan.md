---
section: Fixed
---

## en

- Storage cleanup preview no longer fails with "Something went wrong" when a Bot's Memory folder holds a link, a socket or another special file, misses its Git metadata, or is gone. The preview now skips those entries while still keeping attachments that Memory text mentions, and the Host log records the underlying error when a cleanup step does fail ([#2882](https://github.com/BotHarness/DeepSeekBot/issues/2882)).

## zh

- 当某个 Bot 的 Memory 文件夹里有软链接、socket 等特殊文件、缺少 Git 元数据或文件夹已不存在时，存储清理的「预览清理」不再报「操作失败，请重试」。预览会跳过这些条目，同时仍保留 Memory 文本里引用到的附件；清理步骤真的失败时，Host 日志会记下具体原因（[#2882](https://github.com/BotHarness/DeepSeekBot/issues/2882)）。
