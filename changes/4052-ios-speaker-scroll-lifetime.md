---
section: Fixed
---

## en

- Kept iOS Channel speaker avatars on React Native's native scroll-listener lifecycle instead of observing UIKit scrolling properties, avoiding the native scrolling failure seen when opening a Channel ([#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)).
- Paused following the latest message when interacting with iOS GenUI controls, revealing the focused embedded input above the chat input bar when the keyboard opens ([#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)).

- Prevented delayed message-sheet actions and removed-message snapshots from reopening an old source page; close it when cleanup retains a message placeholder ([#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)).

## zh

- iOS Channel 发言者头像改用 React Native 原生滚动监听及其生命周期，避免观察 UIKit 滚动属性时出现的 Channel 打开后原生退出问题（[#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)）。
- 操作 iOS GenUI 控件时暂停跟随最新消息，键盘打开后按当前输入框的实际位置避让聊天输入栏，保持上方输入框与下方多行文本框可见（[#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)）。
- 拒绝会话切换后的延迟消息菜单动作，并在消息移除或变为清理占位时关闭原文页、清除选择，避免之后重新打开旧原文页（[#4052](https://github.com/BotHarness/DeepSeekBot/issues/4052)）。
