---
section: Changed
---

## en

- Sending a message with a Workspace's Project Skill now reads only that Skill's file instead of rescanning every Skill folder, and listing a PersonaBot's Project Skills no longer scans the same folder twice. With 2000 Skills, resolve on send drops from about 540ms to under 1ms and a full workspace scan from about 550ms to 340ms ([#4355](https://github.com/BotHarness/DeepSeekBot/issues/4355)).

## zh

- 发送带 Workspace 中 Project Skill 的消息时，只读取这个 Skill 的文件，不再重新扫描全部 Skill 目录；列出 PersonaBot 的 Project Skill 时也不再把同一个目录扫两遍。在 2000 个 Skill 的场景下，发送时的解析从约 540ms 降到 1ms 以内，完整扫描一个 Workspace 从约 550ms 降到 340ms（[#4355](https://github.com/BotHarness/DeepSeekBot/issues/4355)）。
