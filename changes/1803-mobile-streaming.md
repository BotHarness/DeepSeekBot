---
section: Changed
---

## en

- In the DeepSeekBot mobile app, a streaming reply in a DM no longer redraws every message on each token: the phone batches draft updates, redraws only the reply being written, and re-reads only its last unfinished paragraph, so long replies stay smooth ([#1803](https://github.com/BotHarness/DeepSeekBot/issues/1803)).

## zh

- DeepSeekBot 手机 App 的私聊页在 Bot 流式回复时，不再每个 token 都重画全部消息：手机会合并草稿更新，只重画正在生成的那条，并且只重新解析最后一段未结束的内容，长回复也能保持流畅（[#1803](https://github.com/BotHarness/DeepSeekBot/issues/1803)）。
