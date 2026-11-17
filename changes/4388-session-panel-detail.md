---
section: Added
---

## en

- The Sessions panel shows each Session's DSH goal and to-do progress (for example 3/6), uses the current to-do as the row's status line, and moves a running Session with no new event for 10 minutes into a Stuck section. Clicking a Session opens the full Session beside the messages, with the goal and to-dos as chips that expand in place, and a composer that sends a message straight into an Assignment while the Orchestrator gets an Inbox notice. `deepseekbot session-progress` and `deepseekbot session-transcript` read the same data ([#4388](https://github.com/BotHarness/DeepSeekBot/pull/4388)).
- A Bot can list the Assignments a Human DM message is about with `session_ids`: each shows on the message as New (below the text) or Sent to (above it), judged from that turn's own tool calls, folded when there are several and hidden from the Sessions view menu. Writing `[title](session:<id>)` in the text shows a chip that opens the Session; external IM gets the plain title ([#4388](https://github.com/BotHarness/DeepSeekBot/pull/4388)).

## zh

- 会话面板显示每个会话的 DSH 目标和任务进度（例如 3/6），用当前任务作为这一行的进展，运行中但 10 分钟没有新事件的会话会归到「卡住了」分组。点击会话会在消息旁边打开完整会话：目标和任务以 chip 显示，点开在原地展开；输入框把消息直接发进 Assignment，同时 Orchestrator 会在 Inbox 收到通知。`deepseekbot session-progress` 和 `deepseekbot session-transcript` 读取同样的数据（[#4388](https://github.com/BotHarness/DeepSeekBot/pull/4388)）。
- Bot 可以用 `session_ids` 列出一条 Human 私信涉及的 Assignment：按这一轮实际的工具调用，在消息上显示为「新建」（正文下方）或「转给」（正文上方），多个时折叠，可在会话视图菜单里隐藏。正文里写 `[标题](session:<id>)` 会显示成可点开会话的 chip，外部 IM 只显示标题（[#4388](https://github.com/BotHarness/DeepSeekBot/pull/4388)）。
