---
section: Added
---

## en

- Session detail now streams thinking, replies and running commands as they happen, with a timer on the running step. Opening a tool step shows its command and output, the file diff, the lines read, search matches or fetched links. Large step groups scroll inside a capped height. Each turn shows tokens and speed, each message shows what triggered it, and a rail jumps between turns. Bot settings → Sessions sets the detail level, when a turn folds and which replies stay visible. `deepseekbot session-live` and `deepseekbot session-tool` read the same data ([#4408](https://github.com/BotHarness/DeepSeekBot/pull/4408)).

## zh

- 会话详情现在会实时显示思考、回复和正在运行的命令，运行中的步骤带计时。点开工具步骤可以看到命令和输出、文件改动、读取的内容、搜索结果或访问的链接；步骤很多时在限定高度内滚动。每一轮显示 token 数和速度，每条消息标明来源，侧边刻度可以在轮次之间跳转。Bot 设置 → 会话可以设置详细程度、何时折叠和折叠后保留哪些回复。`deepseekbot session-live` 和 `deepseekbot session-tool` 读取同样的数据（[#4408](https://github.com/BotHarness/DeepSeekBot/pull/4408)）。
