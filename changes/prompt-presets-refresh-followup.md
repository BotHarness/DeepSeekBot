---
section: Fixed
---

## en

- Prompt presets now reread the Host when the phone app returns to the foreground; on both desktop and phone an older read that finishes late no longer overwrites a newer one, a failed refresh keeps the cached presets on screen with a Retry button, and resetting a part to built-in still removes the override when the built-in text changes while the editor is open ([#4508](https://github.com/BotHarness/DeepSeekBot/pull/4508)).

## zh

- 提示词预设在手机 App 回到前台时会重新读取 Host；桌面和手机上，较早发出但较晚返回的读取不会再覆盖较新的结果；刷新失败时保留已显示的预设并提供「重试」；编辑器打开期间内置文本变化时，「恢复为内置」仍会正确移除覆盖（[#4508](https://github.com/BotHarness/DeepSeekBot/pull/4508)）。
