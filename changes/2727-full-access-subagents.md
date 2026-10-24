---
section: Fixed
---

## en

- Fixed delegated Subagents being blocked before their first model request when a Bot's chat uses Full access. Subagents retain their restricted workspace and cannot request approval; the parent keeps its chosen access ([#2727](https://github.com/BotHarness/DeepSeekBot/issues/2727)).

## zh

- 修复 Bot 聊天开启完全访问后，委托子代理在首次模型请求前被拦截的问题。子代理继续使用受限工作区且不可申请审批，父会话保持所选访问权限（[#2727](https://github.com/BotHarness/DeepSeekBot/issues/2727)）。
