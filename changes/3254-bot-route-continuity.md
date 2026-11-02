---
section: Fixed
---

## en

- Refresh cross-device Bot routes before each explicit DM send, so a colleague can remain in the same conversation when Tailnet or Connect becomes unavailable or returns. Failed and unknown sends are never replayed through another route or after restart ([#3254](https://github.com/BotHarness/DeepSeekBot/issues/3254)).

## zh

- 每次明确发送跨设备 Bot 私聊前刷新路由，Tailnet 或 Connect 不可用及恢复后仍延续同一会话；失败和结果未知的消息不会经另一条路线或在重启后补发（[#3254](https://github.com/BotHarness/DeepSeekBot/issues/3254)）。
