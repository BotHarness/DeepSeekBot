---
section: Added
---

## en

- The desktop and Web message composer takes voice input. When a speech recognition (ASR) Provider is set up, the empty composer says "Hold to talk": hold the input to talk and release to finish, or click the new mic next to Send to start and click it again to stop. Words appear in the composer as you speak, through Soniox streaming or pause-by-pause pieces from the local SenseVoice service, and stay there for you to edit and send; Esc cancels and restores the draft. A DM uses that Bot's ASR binding, other chats the Host's first ASR Provider. Audio is never stored. `deepseekbot voice-dictate` runs the same path from a WAV file ([#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)).

## zh

- 桌面端和 Web 的消息输入框支持语音输入了。设置好语音识别（ASR）服务后，空输入框会提示「按住说话」：在输入框上按住说话，松手结束；也可以点发送按钮旁新增的麦克风开始，再点一下结束。说话时文字实时出现在输入框里（Soniox 流式转写，或本地 SenseVoice 按停顿逐段转写），结束后留在输入框，可以修改后再发送；按 Esc 取消并恢复原来的草稿。DM 里用该 Bot 绑定的 ASR，其他聊天用 Host 上第一个 ASR 服务。音频不会被保存。`deepseekbot voice-dictate` 可以用 WAV 文件跑同一条链路（[#3467](https://github.com/BotHarness/DeepSeekBot/issues/3467)）。
