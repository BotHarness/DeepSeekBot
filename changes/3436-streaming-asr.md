---
section: Added
---

## en

- Calls can use Soniox streaming speech-to-text: the Host sends your voice while you are still talking, so your words reach the chat sooner after you stop, and the call screen shows what it hears as you speak. Add it with `deepseekbot voice-provider-add soniox --kind asr --key-stdin` and bind it with `voice-asr-set`; `call-simulate` reports the live text and whether each sentence was streamed. Only the spoken part of a call is sent, and recordings are never stored ([#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)).

## zh

- 通话可以使用 Soniox 流式语音转文字：你还在说话时 Host 就把声音送去识别，说完后文字更快出现在聊天里，通话界面也会实时显示听到的内容。用 `deepseekbot voice-provider-add soniox --kind asr --key-stdin` 添加，再用 `voice-asr-set` 绑定；`call-simulate` 会报告实时文字以及每句是否走了流式识别。只发送通话中说话的部分，录音从不保存（[#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)）。
