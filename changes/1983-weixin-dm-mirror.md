---
section: Added
---

## en

- A WeChat paired-owner DM and the Bot's local DM history can now sync both ways. Accepted owner messages appear as bridged messages and accepted replies and proactive posts appear as Bot messages, display-only with no second wake; two per-grant switches in the WeChat connector dialog control it: "Mirror to DM history" (on by default) and "Send web DM to WeChat" (on by default), the latter forwarding your web DM messages and the Bot's replies through the WeChat DM's proactive-send target (it stays disabled until one is set up), subject to the hourly post limit and WeChat's private-chat context ([#1983](https://github.com/BotHarness/DeepSeekBot/issues/1983)).

## zh

- 微信扫码绑定者私聊与 Bot 的本地 DM 历史消息现在可以双向同步：已接收的对方消息以桥接消息显示，已接受的回复与主动发送以 Bot 消息显示，仅作展示、不产生第二次唤醒；微信连接器对话框新增两个开关：「同步到私聊记录」（默认开启）和「网页私聊同步到微信」（默认开启），后者通过该微信私聊的主动发送目标把你在网页私聊里发的消息和 Bot 的回复转发到微信（未设置主动发送目标时该开关不可用），受每小时发送上限和微信私聊上下文限制（[#1983](https://github.com/BotHarness/DeepSeekBot/issues/1983)）。
