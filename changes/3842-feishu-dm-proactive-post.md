---
section: Fixed
---

## en

- A Bot's proactive Feishu/Lark DM to its owner no longer fails with `send-permission-denied` once the owner has chatted with it: the private chat posts through its saved send target with a checked receipt instead of the Group-only speaking check, and an unsaved private chat is no longer listed as postable ([#3842](https://github.com/BotHarness/DeepSeekBot/issues/3842)).

## zh

- Owner 曾在飞书/Lark 单聊中与 Bot 对话后，Bot 主动发给 Owner 的单聊不再一律返回 `send-permission-denied`：单聊改经保存的发送目标并带回执送达，不再走仅适用于群聊的发言权限检查；未保存为发送目标的单聊也不再显示为可发送（[#3842](https://github.com/BotHarness/DeepSeekBot/issues/3842)）。
