---
section: Added
---

## en

- Bots can send voice messages: add a TTS Provider (Fish Audio, ElevenLabs, OpenAI, or any OpenAI-compatible endpoint such as a local Kokoro) in Settings › Voice, pick a voice for each Bot in its Voice settings with a preview, and a Bot that replies with `voice: true` shows a playable voice bar above its text on desktop and iOS. Code, file paths, links and tables are not read out word for word, the text always stays, and a failed voice says why. The same steps are available from `deepseekbot voice-provider-add`, `voice-provider-test`, `voice-set` and `voice-synthesize` ([#3399](https://github.com/BotHarness/DeepSeekBot/issues/3399)).

## zh

- Bot 可以发语音消息了：在设置 › 语音中添加 TTS 语音服务（Fish Audio、ElevenLabs、OpenAI，或任何兼容 OpenAI 的端点，例如本地 Kokoro），在每个 Bot 的语音设置里选择音色并试听；Bot 用 `voice: true` 回复时，桌面端和 iOS 会在文字上方显示可播放的语音条。代码、文件路径、链接和表格不会逐字朗读，文字始终保留，语音生成失败时会说明原因。同样的操作也可以用 `deepseekbot voice-provider-add`、`voice-provider-test`、`voice-set` 和 `voice-synthesize` 完成（[#3399](https://github.com/BotHarness/DeepSeekBot/issues/3399)）。
