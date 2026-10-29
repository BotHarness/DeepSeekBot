---
section: Fixed
---

## en

- A Bot keeps replying when its Memory directory is spelled differently from its chat Session's working directory, for example through a symlinked home or a `DSH_HOME` written another way. Before, the Host compared the two paths as plain text, so every message failed until a new Session was started. When the chat Session really runs in another directory, such as after the profile moved, the Host now moves the Bot to a new Session on its own instead of failing every message ([#2990](https://github.com/BotHarness/DeepSeekBot/issues/2990)).

## zh

- 当 Bot 的记忆目录和聊天会话的工作目录指向同一位置、只是写法不同（例如家目录经过符号链接，或 `DSH_HOME` 换了写法）时，Bot 会正常回复。以前 Host 按字符串比较这两个路径，每条消息都会失败，只能新开会话才能恢复。如果聊天会话确实运行在另一个目录（例如配置目录被搬走之后），Host 现在会自动为 Bot 换一个新会话，而不是让每条消息都失败（[#2990](https://github.com/BotHarness/DeepSeekBot/issues/2990)）。
