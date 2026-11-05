---
section: Fixed
---

## en

- The phone's Connect computer list uses the relay's live tunnel status, so a sleeping or closed computer shows as offline instead of failing to pair. If the relay cannot read live status, the list falls back to whether a tunnel was registered ([#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)).

## zh

- 手机 Connect 电脑列表改用 relay 读取的实时隧道状态，休眠或关闭的电脑会显示为离线，不会再点了之后配对失败。relay 读不到实时状态时，会退回按是否注册过隧道来判断（[#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)）。
