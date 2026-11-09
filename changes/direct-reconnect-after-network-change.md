---
section: Fixed
---

## en

- On the phone app, a direct link to a Host comes back after the phone changes network (for example from Wi-Fi to a hotspot). The app keeps using the private route meanwhile and offers a new direct link a few seconds after the old one drops, or right away when the private route reconnects, backing off up to five minutes while direct keeps failing ([#3747](https://github.com/BotHarness/DeepSeekBot/issues/3747)).

## zh

- 手机 App 换网（比如从 Wi-Fi 切到热点）后，和 Host 的直连会自动恢复。期间继续走私有线路，旧直连断开几秒后重新发起直连；私有线路重连时会立刻重试；直连一直失败时逐步放慢，最长每五分钟试一次（[#3747](https://github.com/BotHarness/DeepSeekBot/issues/3747)）。
