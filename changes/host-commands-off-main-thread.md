---
section: Fixed
---

## en

- The Host no longer freezes for seconds while it reads Bot memory activity, checks Git, admits another Bot over Tailscale or detects phone routes on Windows: those commands now start off the Host's main thread, so Bot calls keep their heartbeat, speech and playback on time ([#3895](https://github.com/BotHarness/DeepSeekBot/issues/3895)).

## zh

- 在 Windows 上，Host 读取 Bot 记忆活动、检查 Git、通过 Tailscale 准入其他 Bot 或检测手机线路时，不再卡住数秒：这些命令改为在 Host 主线程之外启动，Bot 通话的心跳、语音识别和播放都能按时进行（[#3895](https://github.com/BotHarness/DeepSeekBot/issues/3895)）。
