---
section: Added
---

## en

- Quote several messages, or only part of one, in a single message. Reply and Quote are now one action: "Quote" on a message cites the whole message, and when text in it is selected it cites just that text. Selecting text also shows a small Quote button above it, and "Copy" in the menu copies only the selection. Each quote waits as a chip in the message box with an optional reply to that quote, and the sent message shows them above its text as quote cards; the bar a reply shows for the message it answers uses the same card, and a quote's reply sits right under its card. Bots see what you quoted and can cite several earlier messages in their own replies (`bot_send_message` `quotes`; CLI `deepseekbot send --quote` / `--quote-note`) ([#4400](https://github.com/BotHarness/DeepSeekBot/issues/4400)).

## zh

- 一条消息可以引用多条消息，或只引用某条消息的一部分。「回复」与「引用」合并为一个操作：对消息选「引用」即引用整条；若消息里有选中的文字，则只引用所选内容。选中文字时上方还会出现一个小的「引用」按钮，菜单里的「复制」也只复制所选内容。每条引用在输入框里显示为一个 chip，可以顺手写一句针对这条引用的回复（也可以留空），发出后以引用卡片显示在正文上方；回复顶部指向原消息的回复条也改用同样的卡片，引用的回复显示在对应卡片下方。Bot 能看到你引用的内容，也能在回复中引用多条历史消息（`bot_send_message` 的 `quotes`；CLI `deepseekbot send --quote` / `--quote-note`）（[#4400](https://github.com/BotHarness/DeepSeekBot/issues/4400)）。
