---
section: Fixed
---

## en

- Bots now recover from gateway token-limit errors that DSH reports as ordinary invalid requests: Tobs requests native context compaction and retries once after committed progress, instead of repeatedly failing until paused ([#4253](https://github.com/BotHarness/DeepSeekBot/issues/4253)).

## zh

- 修复网关上下文超限错误被 DSH 归类为普通无效请求后 Bot 连续失败直至暂停的问题：Tobs 调用原生上下文压缩，在确认变更已提交后重试一次（[#4253](https://github.com/BotHarness/DeepSeekBot/issues/4253)）。
