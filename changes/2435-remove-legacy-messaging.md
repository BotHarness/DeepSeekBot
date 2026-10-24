---
section: Removed
---

## en

- Removed obsolete Bot sending tools from both model and direct CLI catalogs; use `bot_send_message` for delivery and `channel_action` for draft actions/reactions. Approval requests no longer force a preliminary message and retry; the model decides when an explanation helps ([#2435](https://github.com/BotHarness/DeepSeekBot/issues/2435)).

## zh

- 移除模型和直接 CLI 目录中的旧 Bot 发送工具，统一使用 `bot_send_message` 发送、`channel_action` 操作草稿和表情。审批请求不再强制先发说明再重试，由模型判断何时需要解释（[#2435](https://github.com/BotHarness/DeepSeekBot/issues/2435)）。
