---
section: Fixed
---

## en

- Read Android call ICE gathering state before taking its answer snapshot, and require a candidate before sending the answer. An empty answer now waits for the existing gathering deadline instead of starting a connection that cannot use it ([#3888](https://github.com/BotHarness/DeepSeekBot/issues/3888)).

## zh

- Android 通话先读取 ICE 收集状态，再获取应答快照，并在发送前确认已有候选。空应答会等待现有收集期限，不再直接启动无法使用该应答的连接（[#3888](https://github.com/BotHarness/DeepSeekBot/issues/3888)）。
