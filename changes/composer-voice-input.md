---
section: Added
---

## en

- The desktop and Web message composer takes voice input. When a speech recognition (ASR) Provider is set up, the empty composer says "Hold to talk": hold the input to talk and release to finish, even after moving off it, or click the new mic next to Send to start and click the mic or the input to stop. While recording, the mic ripples and the composer border glows in the primary color. Words appear at the caret as you speak, even in a draft that already has text, through Soniox streaming or pause-by-pause pieces from the local SenseVoice service, and stay there for you to edit and send. A DM uses that Bot's ASR binding, other chats the Host's first ASR Provider. Audio is never stored. `deepseekbot voice-dictate` runs the same path from a WAV file ([#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)).

## zh

- 桌面端和 Web 的消息输入框支持语音输入了。设置好语音识别（ASR）服务后，空输入框会提示「按住说话」：在输入框上按住说话，松手结束，移出输入框后松手也一样；也可以点发送按钮旁新增的麦克风开始，再点麦克风或输入框结束。录音时麦克风有波纹，输入框边框和阴影变成主题色。说话时文字实时插入到光标位置，已有文字的草稿也可以继续说（Soniox 流式转写，或本地 SenseVoice 按停顿逐段转写），结束后留在输入框，可以修改后再发送。DM 里用该 Bot 绑定的 ASR，其他聊天用 Host 上第一个 ASR 服务。音频不会被保存。`deepseekbot voice-dictate` 可以用 WAV 文件跑同一条链路（[#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)）。
