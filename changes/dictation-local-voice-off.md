---
section: Fixed
---

## en

- Dictation no longer reports ready while the Bot's local speech service on the computer is stopped: it says the service is off, so the phone switches to its own speech recognition instead of failing on the first words. Calls and dictation now pick a Bot's speech Provider the same way, and `deepseekbot voice-dictate` reports not ready with `local-voice-off` ([#3786](https://github.com/BotHarness/DeepSeekBot/issues/3786)).

## zh

- 电脑上 Bot 的本地语音服务停止时，语音输入不会再显示为可用：它会说明服务没开，手机会改用系统的语音识别，而不是说第一句话就失败。通话和语音输入现在用同一套规则选择 Bot 的语音服务，`deepseekbot voice-dictate` 也会以 `local-voice-off` 报告未就绪（[#3786](https://github.com/BotHarness/DeepSeekBot/issues/3786)）。
