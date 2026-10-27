---
section: Fixed
---

## en

- When the Host refuses a Bot's turn before it starts (the chat Session's working directory is not the Bot's Memory directory, the Session's permissions differ from the Bot's access setting, an Assignment's Workspace Grant was revoked, and so on), the chat's failure notice now says which check refused it and how to fix it, for example "Start a new session", instead of "Agent turn ended without completion: blocked" ([#2989](https://github.com/BotHarness/DeepSeekBot/issues/2989)).

## zh

- Host 在 Bot 这一轮开始前拒绝运行时（例如聊天会话的工作目录不是 Bot 的 Memory 目录、会话权限与 Bot 的访问设置不一致、事项的工作区授权已撤销），聊天里的失败提示现在会说明是哪项检查拒绝了它以及怎么修复（例如「开启新会话」），不再只显示「Agent turn ended without completion: blocked」（[#2989](https://github.com/BotHarness/DeepSeekBot/issues/2989)）。
