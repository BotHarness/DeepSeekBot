---
section: Fixed
---

## en

- A PersonaBot asked from an IM conversation (QQ, WeChat, Lark and others) for an API key or other private value can now get it. Before, a Host without `privateInputWebUrl` refused to open the input card at all, so the Owner had nowhere to enter the key and sent it in the chat instead. The card now opens in the Bot's Chat and the IM conversation gets a notice to fill it in there. A replacement card opened from a Group account's settings now also accepts the new value ([#3340](https://github.com/BotHarness/DeepSeekBot/issues/3340)).

## zh

- 从 IM 会话（QQ、微信、飞书等）里让 PersonaBot 使用 API key 等私密信息时，Bot 现在能收到 Owner 填写的值。此前没有设置 `privateInputWebUrl` 的 Host 会直接拒绝打开输入卡，Owner 无处填写，只能把 key 明文发在聊天里。现在卡片会在该 Bot 的 Chat 中打开，IM 会话收到去那里填写的提示。从群组账号设置里发起的替换卡片也能正常提交新值了（[#3340](https://github.com/BotHarness/DeepSeekBot/issues/3340)）。
