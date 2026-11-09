---
section: Changed
---

## en

- Phone Bot calls do less work in the background: the Host check-in slows from every second to every 3 seconds while the app is hidden and catches up as soon as it returns, the call screen only redraws when something you can see changes, and muting now turns the microphone off instead of sending silence ([#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)).

## zh

- 手机上的 Bot 通话在后台更省电：App 不可见时，与 Host 的心跳从每秒一次降到每 3 秒一次，回到前台立即补一次；通话界面只在看得到的内容变化时才重绘；静音时会真正关闭麦克风，而不是继续发送静音（[#3481](https://github.com/BotHarness/DeepSeekBot/issues/3481)）。
