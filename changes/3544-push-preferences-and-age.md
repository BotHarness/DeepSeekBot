---
section: Fixed
---

## en

- The phone no longer re-sends its notification preferences to every paired Host on each reconnect, app resume, route change or retry of another Host, which happened about every 21 seconds during a call. It sends a copy only to a Host that does not have it yet. The Host's `push phase=sent` log line now also says how long after a request or reply was created its push went out (`ageMs`), so a late banner can be placed on the Host or after it ([#3544](https://github.com/BotHarness/DeepSeekBot/issues/3544)).

## zh

- 手机不再在每次重连、回到前台、线路变化或重试另一台 Host 时，向所有已配对 Host 重发通知偏好（通话中约每 21 秒一次）。现在只向还没有这份偏好的 Host 发送。Host 日志中的 `push phase=sent` 行也会记录请求或回复创建后多久才发出推送（`ageMs`），便于判断迟到的横幅是延迟在 Host 还是之后的环节（[#3544](https://github.com/BotHarness/DeepSeekBot/issues/3544)）。
