---
section: Fixed
---

## en

- The bundled IM Provider moves to `4.32.0-botharness.23` and ships the QQ fixes. Bots on DSH 0.2.1 can create sessions again instead of failing with `INTERNAL_UNKNOWN` ([#2896](https://github.com/BotHarness/DeepSeekBot/issues/2896)). Quoted, image and mixed QQ messages are no longer dropped ([#2895](https://github.com/BotHarness/DeepSeekBot/issues/2895)). Concurrent QQ group replies retry on 429 ([#2897](https://github.com/BotHarness/DeepSeekBot/issues/2897)). Late QQ results are delivered as passive replies ([#2868](https://github.com/BotHarness/DeepSeekBot/issues/2868)). QQ private messages arrive in Bot mode ([#2918](https://github.com/BotHarness/DeepSeekBot/issues/2918)).
- Lark Bot mode replies that use Markdown are sent as a native Markdown card, so bold text, headings, lists and tables no longer show raw symbols. Plain replies and replies that @ someone stay text ([#2792](https://github.com/BotHarness/DeepSeekBot/issues/2792)).

## zh

- 内置 IM Provider 升级到 `4.32.0-botharness.23`，包含 QQ 修复。DSH 0.2.1 上的 Bot 可以重新创建会话，不再报 `INTERNAL_UNKNOWN`（[#2896](https://github.com/BotHarness/DeepSeekBot/issues/2896)）。QQ 的引用、图片和图文混合消息不再丢失（[#2895](https://github.com/BotHarness/DeepSeekBot/issues/2895)）。QQ 群内并发回复遇到 429 会重试（[#2897](https://github.com/BotHarness/DeepSeekBot/issues/2897)）。迟到的 QQ 结果会以被动回复送达（[#2868](https://github.com/BotHarness/DeepSeekBot/issues/2868)）。Bot 模式可以收到 QQ 私聊（[#2918](https://github.com/BotHarness/DeepSeekBot/issues/2918)）。
- 飞书 Bot 模式中使用 Markdown 的回复改为原生 Markdown 卡片发送，加粗、标题、列表和表格不再显示原始符号。纯文本回复和 @ 他人的回复仍按文本发送（[#2792](https://github.com/BotHarness/DeepSeekBot/issues/2792)）。
