---
section: Fixed
---

## en

- Restored the approval behavior from before #4266: tool effect declarations again only label approval cards. Bot messages, Subagents, Assignments, Channel actions and CLI operations no longer wait for a card. Authorized Browser and Computer sessions no longer ask per action, and Full Access again answers ordinary calls. Secrets, Bot creation, attachment writes and protected management keep their approval ([#4334](https://github.com/BotHarness/DeepSeekBot/pull/4334), [#4210](https://github.com/BotHarness/DeepSeekBot/issues/4210)).

## zh

- 恢复 #4266 之前的审批行为：工具效果声明重新只用于审批卡标签。Bot 发消息、Subagent、Assignment、Channel 动作和 CLI 操作不再等待审批卡；已授权的 Browser 与 Computer 会话不再逐次询问；Full Access 重新对普通调用直接放行。密钥、创建 Bot、附件写入和受保护管理操作仍需审批（[#4334](https://github.com/BotHarness/DeepSeekBot/pull/4334)、[#4210](https://github.com/BotHarness/DeepSeekBot/issues/4210)）。
