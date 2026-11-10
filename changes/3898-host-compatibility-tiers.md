---
section: Changed
---

## en

- A newer DSH no longer stops every Bot turn when it changes an optional Host API: the Bot keeps working without that feature and the diagnostic log names it. When a Bot cannot run on the installed DSH, the failure now says the Tobs version does not support it and to update Tobs, with the original error under the details ([#3898](https://github.com/BotHarness/DeepSeekBot/issues/3898)).

## zh

- 较新的 DSH 改动可选的 Host API 时，不会再让每一轮 Bot 都失败：Bot 会跳过这项功能继续工作，诊断日志会记下是哪一项。如果 Bot 确实无法在当前 DSH 上运行，失败提示会说明这个 Tobs 版本还不支持当前的 DSH、需要更新 Tobs，原始报错保留在详情里（[#3898](https://github.com/BotHarness/DeepSeekBot/issues/3898)）。
