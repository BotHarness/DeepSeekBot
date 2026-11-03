---
section: Fixed
---

## en

- Fixed live Host updates remaining disconnected after the mobile app returns to the foreground when the old connection stops delivering without a close event. Recovery restores subscriptions and waits for in-flight requests to finish or time out without replaying them ([#3336](https://github.com/BotHarness/BotHarness/issues/3336)).

## zh

- 修复移动端回到前台后，旧连接静默失效却未触发关闭事件，导致 Host 实时更新无法恢复的问题。恢复时重新建立订阅，并等待在途请求完成或超时，不重复发送请求（[#3336](https://github.com/BotHarness/BotHarness/issues/3336)）。
