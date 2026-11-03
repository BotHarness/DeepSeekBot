---
section: Fixed
---

## en

- The Host no longer slows down as a conversation grows: sending a message, looking one up, reading a page, catching up after a reconnect and checking whether a permission request was answered now read only the messages they need instead of the whole conversation history ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).
- A Bot listing its Inbox during a turn no longer scans its whole admission history, and usage tracking no longer walks every model request of a Session on each Session event ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 会话变长后 Host 不再随之变慢：发送消息、按 id 查找消息、读取一页、断线重连后补齐消息，以及检查权限请求是否已被回应，现在都只读取需要的消息，不再读取整段会话历史（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
- Bot 在一轮对话中查看 Inbox 时，不再扫描它的全部收件历史；用量统计也不再在每个会话事件上遍历该会话的所有模型请求（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
