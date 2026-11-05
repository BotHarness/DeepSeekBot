---
section: Fixed
---

## en

- Fixed group deletion and content cleanup failing when a reply's causal parent was already purged; startup can replay previously accepted cleanup records without weakening protection against restoring deleted content ([#3446](https://github.com/BotHarness/DeepSeekBot/issues/3446)).

## zh

- 修复回复的上游消息已清除时，解散群或清理内容失败的问题；启动时可重放此前已接受的清理记录，并保留阻止已删除内容复活的保护（[#3446](https://github.com/BotHarness/DeepSeekBot/issues/3446)）。
