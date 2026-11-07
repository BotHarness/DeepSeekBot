---
section: Changed
---

## en

- Sharing your camera or screen on a call now always saves its frames to the DM, so every grid the Bot sees stays there to look back on; delete an attachment afterwards if you do not want to keep it. The "Save frames to the chat" switch, `deepseekbot call-simulate --no-save` and `call-frame <message-id> 0` are gone, `call-frame` takes cells from 1, and a call client that still sends the old `save` setting is refused with `invalid-input` ([#3697](https://github.com/BotHarness/DeepSeekBot/issues/3697)).

## zh

- 通话中共享摄像头或屏幕时，画面现在总会保存到 DM，Bot 看过的每张宫格图都能回看；不想保留可以事后删除附件。“保存画面到聊天”开关、`deepseekbot call-simulate --no-save` 和 `call-frame <message-id> 0` 已移除，`call-frame` 的格号从 1 开始，仍发送旧 `save` 设置的通话客户端会被以 `invalid-input` 拒绝（[#3697](https://github.com/BotHarness/DeepSeekBot/issues/3697)）。
