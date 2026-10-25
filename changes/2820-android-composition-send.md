---
section: Fixed
---

## en

- Prevented Android hardware Enter from sending a message while confirming composed text, including delayed input-method key or newline echoes; changing input focus clears the previous field’s pending send key ([#2820](https://github.com/BotHarness/DeepSeekBot/issues/2820)).

- Prevented iOS and iPadOS Command+Return from sending marked text or using a cached shortcut after focus leaves the composer; the next normal shortcut still sends once ([#2820](https://github.com/BotHarness/DeepSeekBot/issues/2820)).

## zh

- 修复 Android 外接键盘 Enter 确认输入法组合文字时可能误发消息的问题，包括输入法稍后回送按键或换行的情况；切换输入框会清除前一个输入框待处理的发送按键（[#2820](https://github.com/BotHarness/DeepSeekBot/issues/2820)）。

- 修复 iOS 和 iPadOS 上 Command+Return 误发组合文字，以及输入焦点离开后旧快捷键仍可发送的问题；下一次正常快捷键仍只发送一次（[#2820](https://github.com/BotHarness/DeepSeekBot/issues/2820)）。
