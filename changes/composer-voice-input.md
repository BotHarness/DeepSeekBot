---
section: Added
---

## en

- The desktop and Web message composer takes voice input. When a speech recognition (ASR) Provider is set up, the empty composer says "Hold to talk": hold the input to talk and release to finish, even after moving off it, or click the new mic next to Send to start and click the mic or the input to stop. While recording, the mic ripples and the composer border glows in the primary color. Words appear at the caret as you speak, even in a draft that already has text, through Soniox streaming or pause-by-pause pieces from the local SenseVoice service, and stay there for you to edit and send. A DM uses that Bot's ASR, other chats the Host's default ASR Provider. Audio is never stored. `deepseekbot voice-dictate` runs the same path from a WAV file ([#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)).
- Settings › Voice has separate Speech synthesis (TTS) and Speech recognition (ASR) sections, each with a Host-wide default at the top. Every Bot uses the defaults unless its own Voice panel picks another service or voice, so one default ASR turns on voice input and one default TTS turns on voice messages and calls for all Bots. The first service of each kind becomes the default by itself. The model is now a list of the service's known models with a Custom… choice, and the name can stay empty: the Host picks the service name, numbered when it is taken. `deepseekbot voice-defaults` and `voice-default-set` do the same from the CLI ([#3471](https://github.com/BotHarness/DeepSeekBot/pull/3471)).

## zh

- 桌面端和 Web 的消息输入框支持语音输入了。设置好语音识别（ASR）服务后，空输入框会提示「按住说话」：在输入框上按住说话，松手结束，移出输入框后松手也一样；也可以点发送按钮旁新增的麦克风开始，再点麦克风或输入框结束。录音时麦克风有波纹，输入框边框和阴影变成主题色。说话时文字实时插入到光标位置，已有文字的草稿也可以继续说（Soniox 流式转写，或本地 SenseVoice 按停顿逐段转写），结束后留在输入框，可以修改后再发送。DM 里用该 Bot 的 ASR，其他聊天用 Host 的默认 ASR 服务。音频不会被保存。`deepseekbot voice-dictate` 可以用 WAV 文件跑同一条链路（[#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)）。
- 设置 › 语音分成「语音合成（TTS）」和「语音识别（ASR）」两部分，每部分顶部有全局默认。Bot 默认跟随全局设置，也可以在自己的语音面板里换成别的服务或音色。所以只要设一个默认 ASR，所有 Bot 都能语音输入；设一个默认 TTS，所有 Bot 都能发语音消息和通话。每种类型添加的第一个服务会自动成为默认。「模型」改成该服务已知模型的下拉选择，并带「自定义…」；名称可以不填，Host 会用服务名，重名时自动编号。`deepseekbot voice-defaults` 和 `voice-default-set` 在命令行做同样的事（[#3471](https://github.com/BotHarness/DeepSeekBot/pull/3471)）。
