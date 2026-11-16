---
section: Added
---

## en

- Type `/` in a PersonaBot DM to pick a Skill: commands come first, then Host Skills and the Skills in the Bot's Memory Repository `.agents/skills`, each with its owner and a one-line description. The picked Skill becomes a chip, its text is saved with the message, and the Bot reads that text with your message; `deepseekbot skills-list` and `send --skill` do the same from the CLI ([#4232](https://github.com/BotHarness/DeepSeekBot/issues/4232)).

## zh

- 在 PersonaBot 私聊中输入 `/` 即可选择 Skill：先列命令，再列 Host Skill 和该 Bot Memory Repository `.agents/skills` 下的 Skill，每行显示归属和单行描述。选中的 Skill 显示为 chip，其文本随消息保存，Bot 会连同你的消息一起读到；CLI 中可用 `deepseekbot skills-list` 和 `send --skill` 完成同样的操作（[#4232](https://github.com/BotHarness/DeepSeekBot/issues/4232)）。
