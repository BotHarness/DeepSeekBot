---
section: Added
---

## en

- Groundwork for Bots in meetings: a Host can now send a Bot to a meeting as one of its calls, hear the meeting through the Bot's speech recognition, and keep the transcript out of every Channel. The Bot gets `meeting_join`, `meeting_leave`, `meeting_status` and `meeting_transcript`, with matching `deepseekbot meeting-*` commands, and writes a recap to the conversation the link came from when the meeting ends. ([#5369](https://github.com/BotHarness/DeepSeekBot/issues/5369), [decision](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/calls.md#meeting-attendance)).

## zh

- Bot 参会的基础：Host 现在可以把参会当作 Bot 的一通通话，用 Bot 的语音识别听会，会议内容不进入任何 Channel。Bot 新增 `meeting_join`、`meeting_leave`、`meeting_status`、`meeting_transcript` 工具和对应的 `deepseekbot meeting-*` 命令，会议结束后把纪要发回链接来源的对话。（[#5369](https://github.com/BotHarness/DeepSeekBot/issues/5369)、[decision](https://github.com/BotHarness/DeepSeekBot/blob/main/docs/decisions/calls.md#meeting-attendance)）。
