---
section: Fixed
---

## en

- Profile and Overview usage now show cache-read and cache-write tokens for PersonaBots on routes that leave a zero cache count out of a response, such as DeepSeek through OpenCode Go, instead of marking them unknown and the total partial. A bucket is filled in only when the response's total proves its value; usage recorded before this update is unchanged ([#1787](https://github.com/BotHarness/DeepSeekBot/issues/1787)).

## zh

- 对于在响应里省略为 0 的缓存计数的路由（例如通过 OpenCode Go 使用 DeepSeek），PersonaBot 的资料页和概览用量现在会显示缓存读取和缓存写入 Token，不再标为未知、总数也不再显示为部分。只有当响应里的总数能证明某项的值时才会补上；本次更新之前记录的用量保持不变（[#1787](https://github.com/BotHarness/DeepSeekBot/issues/1787)）。
