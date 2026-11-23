---
section: Fixed
---

## en

- Retrying a schedule creation after a lost result no longer adds a second schedule, and an approved schedule edit no longer overwrites a change made while its card was pending: `schedule-create --operation-key` reconciles a retry, every schedule shows a `revision`, and `schedule-update`/`schedule-delete --expected-revision` refuse a stale one. Tob always passes them ([#4829](https://github.com/BotHarness/DeepSeekBot/issues/4829)).

## zh

- 定时任务创建的结果丢失后重试，不会再多出第二个任务；批准的定时任务修改也不会覆盖卡片等待期间的改动：`schedule-create --operation-key` 让重试对上原来的任务，每个任务都显示 `revision`，`schedule-update`/`schedule-delete --expected-revision` 会拒绝过期的修改。Tob 总会带上它们（[#4829](https://github.com/BotHarness/DeepSeekBot/issues/4829)）。
