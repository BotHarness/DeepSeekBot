---
section: Fixed
---

## en

- Phone push, badges and clearing read notifications work again. Since the change that clears read replies on every device, the Host asked for more unread replies than one query allows, so every push update failed before reaching any phone. Replies are now read in pages ([#3902](https://github.com/BotHarness/DeepSeekBot/pull/3902)).

## zh

- 手机推送、角标和已读后清除通知恢复正常。自从“已读回复在所有设备上清除通知”那次改动后，Host 一次请求的未读回复数量超过了单次查询上限，每次推送更新都在发给手机之前就失败了。现在改为分页读取（[#3902](https://github.com/BotHarness/DeepSeekBot/pull/3902)）。
