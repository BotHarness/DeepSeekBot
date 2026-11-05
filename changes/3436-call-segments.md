---
section: Changed
---

## en

- Calls with a whole-sentence speech-to-text Provider (such as Groq or a local SenseVoice service) now recognize each piece of what you say at short pauses while you keep talking, and the call screen shows those pieces as they come in. When you stop, only the last piece is left to recognize, so your words reach the chat sooner; `call-simulate` reports how many pieces each sentence used ([#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)).
- Calls with Soniox now open the next connection while you are still in the call, so short sentences show live text from the first word instead of waiting for the connection to start ([#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)).

## zh

- 使用整句语音转文字 Provider（如 Groq 或本地 SenseVoice 服务）的通话，现在会在你说话的短停顿处先识别已说完的部分，你可以继续说，通话界面也会逐段显示。说完时只剩最后一段需要识别，文字会更快出现在聊天里；`call-simulate` 会报告每句用了几段（[#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)）。
- 使用 Soniox 的通话现在会提前建立下一句的连接，短句也能从第一个字开始显示实时文字，不用等连接建好（[#3436](https://github.com/BotHarness/DeepSeekBot/issues/3436)）。
