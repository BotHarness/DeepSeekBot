---
section: Changed
---

## en

- On the phone, an open private input form updates when the Host announces that private input requests changed, and when the app returns to the foreground, instead of re-reading every 2.5 seconds; a 15-second safety read remains while the request is pending. Bot creation recovery no longer re-checks every 10 seconds; it retries on a timer only after a failed attempt ([#4543](https://github.com/BotHarness/DeepSeekBot/issues/4543)).

## zh

- 手机上打开的私密输入表单，改为在 Host 通知私密输入请求变化时、以及 App 回到前台时刷新，不再每 2.5 秒重新读取；请求待处理期间保留 15 秒一次的兜底读取。创建 Bot 的恢复不再每 10 秒检查一次，只在某次尝试失败后才按计时器重试（[#4543](https://github.com/BotHarness/DeepSeekBot/issues/4543)）。
