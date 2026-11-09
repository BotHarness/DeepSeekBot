---
section: Fixed
---

## en

- Device call opening uses its existing connection budget through Host checks and media startup, without an ordinary-command or connected-call heartbeat deadline cutting it short; cancellation also closes media that finishes starting late ([#3831](https://github.com/BotHarness/DeepSeekBot/issues/3831)).

## zh

- 设备发起通话时，Host 检查与媒体启动共用既有连接时限，不再被普通命令或已连接通话的心跳时限提前中断；取消后才启动完成的媒体也会关闭（[#3831](https://github.com/BotHarness/DeepSeekBot/issues/3831)）。
