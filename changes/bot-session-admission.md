---
section: Changed
---

## en

- Every way a Bot's chat Session or Assignment is entered (a new Session, a resumed one, one the Host takes over from DSH, or a native wake) now goes through one admission step that first repairs the Session's permission and then checks it. Taking a Session over only checks that it belongs to the right Bot role, so a refused turn always reaches the chat with its reason and fix. Resuming or taking over a Bot with Full access no longer briefly switches its Session back to workspace-only before the first step ([#2997](https://github.com/BotHarness/DeepSeekBot/issues/2997)).

## zh

- Bot 的聊天会话和任务（Assignment）无论从哪里进入（新建、恢复、Host 从 DSH 接管、原生唤醒），现在都经过同一个准入步骤：先修复会话的权限，再做校验。接管时只检查会话是否属于对应的 Bot 角色，所以被拒绝的一轮总会把原因和修复方法带到聊天里。开启了“完全访问”的 Bot 在恢复或被接管时，会话不会再在第一步之前被临时切回仅工作区权限（[#2997](https://github.com/BotHarness/DeepSeekBot/issues/2997)）。
