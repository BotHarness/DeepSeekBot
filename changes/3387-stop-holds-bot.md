---
section: Fixed
---

## en

- Stop now really stops a Bot: it also stops the Bot's working Assignments, and the Bot takes no automatic wake (other Bots' messages, Group digests, reports, schedules, retries) until a Human writes to it again. A Bot whose automatic runs fail three times in a row with a non-transient error stops instead of retrying ([#3387](https://github.com/BotHarness/DeepSeekBot/issues/3387)).

## zh

- 停止现在会真正停下 Bot：同时停止它正在工作的 Assignment，在 Human 再次给它发消息之前，它不会被任何自动唤醒（其他 Bot 的消息、群摘要、汇报、定时任务、重试）。Bot 的自动运行连续三次因非临时性错误失败时会停下，不再重试（[#3387](https://github.com/BotHarness/DeepSeekBot/issues/3387)）。
