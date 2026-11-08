---
section: Changed
---

## en

- Text you type in a Bot's DM during a call with that Bot now takes the camera or screen picture with it, the same way a spoken sentence does: it carries the newest 9 frames since your last message (older ones are saved first as frame records), or points at the last picture when nothing changed, and the Bot is told when you typed it during the call. Text in other chats is unchanged. `deepseekbot call-simulate --script` takes a `{"at": ms, "text": "…"}` step to type during the call and reports where its frames went under `texts` ([#3694](https://github.com/BotHarness/DeepSeekBot/issues/3694)).

## zh

- 通话中在该 Bot 的 DM 里打字时，文字会像语音句子一样带上摄像头或屏幕画面：带上自上一条消息以来最新的 9 帧（更早的先存为画面记录），画面没变时指向上一张，并告诉 Bot 这是通话中打的字。其他聊天里的文字不受影响。`deepseekbot call-simulate --script` 支持 `{"at": 毫秒, "text": "…"}` 一步在通话中打字，并在 `texts` 下报告它的画面去向（[#3694](https://github.com/BotHarness/DeepSeekBot/issues/3694)）。
