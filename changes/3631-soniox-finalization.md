---
section: Fixed
---

## en

- Retry a Soniox utterance once after an abnormal connection loss, within the original recognition timeout and without saving audio to disk. Incomplete recognition is never sent as a successful sentence ([#3631](https://github.com/BotHarness/DeepSeekBot/issues/3631)).

## zh

- Soniox 连接异常中断后，在原有识别时限内重试当前一句，音频不写入磁盘；未完成确认的识别结果不会被当作完整句子发送（[#3631](https://github.com/BotHarness/DeepSeekBot/issues/3631)）。
