---
section: Fixed
---

## en

- A stale encrypted connection no longer hangs up a call after the phone resumes control on another connection. Cancelled replies to existing-call commands also preserve the call; abandoned call starts still receive cleanup ([#3913](https://github.com/BotHarness/DeepSeekBot/issues/3913)).

## zh

- 手机切换连接并恢复通话控制后，旧加密连接关闭不再挂断通话。已取消的既有通话命令晚返回也不会误挂断；放弃的新通话仍会清理（[#3913](https://github.com/BotHarness/DeepSeekBot/issues/3913)）。
