---
section: Added
---

## en

- Bots can listen to meetings through your window: click **Bring to a meeting** in a Bot's DM header, share the meeting tab or your system sound, and the Bot hears the meeting and your microphone. It does not need text to speech and never speaks. The transcript stays out of every Channel, listening stops after four hours, and when you stop, the Bot writes a recap in its DM. The Bot gets `meeting_leave`, `meeting_status` and `meeting_transcript`, with matching `deepseekbot meeting-*` commands, and `deepseekbot call-simulate --as-meeting` tests the path without a browser ([#5369](https://github.com/BotHarness/DeepSeekBot/issues/5369), [decision](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/calls.md#meeting-attendance)).

## zh

- Bot 可以通过你的窗口听会：在 Bot 私聊顶部点**带去开会**，共享会议标签页或系统声音，Bot 就能听到会议和你的麦克风。听会不需要语音合成，Bot 也不会发言。会议内容不进入任何 Channel，最长听四小时，你停止后 Bot 会在私聊里写纪要。Bot 新增 `meeting_leave`、`meeting_status`、`meeting_transcript` 工具和对应的 `deepseekbot meeting-*` 命令，`deepseekbot call-simulate --as-meeting` 可以不开浏览器测试这条路径（[#5369](https://github.com/BotHarness/DeepSeekBot/issues/5369)、[decision](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/calls.md#meeting-attendance)）。
