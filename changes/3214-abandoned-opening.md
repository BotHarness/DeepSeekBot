---
section: Fixed
---

## en

- Switching chats stops obsolete read-position responses from starting extra message loads, including rapid return to the same chat; the current chat keeps its unread position and expired-anchor fallback ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 切换聊天后，过期的读位置响应不再触发多余的消息加载，快速切回同一聊天也能正确区分；保留当前聊天的未读定位及锚点失效回退（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
