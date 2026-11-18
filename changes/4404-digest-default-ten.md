---
section: Changed
---

## en

- Ordinary Group and external IM messages now wake a Bot after 10 messages or 30 seconds by default, instead of 5 messages or 30 seconds. One wake costs about the same whatever it carries, so this cuts the cost per message by about 40%. Mentions and DMs still wake at once, WeChat routes stay immediate, and saved per-Channel or per-route settings are unchanged ([#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)).

## zh

- 普通群消息和外部 IM 普通消息的默认唤醒改为攒够 10 条或 30 秒，原来是 5 条或 30 秒。一次唤醒的成本基本固定，与带几条消息关系不大，所以每条消息的成本约降 40%。@、私信和微信路由仍然立即唤醒，已保存的频道或路由设置不受影响（[#4404](https://github.com/BotHarness/DeepSeekBot/pull/4404)）。
