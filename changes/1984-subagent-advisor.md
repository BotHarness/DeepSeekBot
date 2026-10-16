---
section: Added
---

## en

- Each PersonaBot gains an optional Subagent advisor (Jev). When enabled in Bot settings (Models & execution) with an opencode.ai API key stored as a Profile secret, a subagent started without an explicit model consults Jev once for the cheapest fitting route among the Bot's allowed model + effort options; the suggestion is only applied while it is still in that set, any failure silently falls back to the upstream default route, and the dispatch card adds a line with Jev's suggested model and effort, or notes that Jev was unavailable and the default route was used. The key is never echoed back to the UI, logs, cards or chat, and the new `subagent-advisor`, `subagent-advisor-set` and `subagent-advisor-key-set` CLI commands configure it without the Web UI ([#1984](https://github.com/BotHarness/DeepSeekBot/issues/1984)).

## zh

- 每个 PersonaBot 新增可选的子代理顾问（Jev）。在 Bot 设置（模型与运行）中开启并保存 opencode.ai 的 API 密钥（密钥作为 Profile 机密存储）后，Bot 启动未显式指定模型的子代理时，会先咨询 Jev 一次，在当前允许的「模型 + 推理强度」组合中挑选性价比合适的一条路由；只有当建议仍在允许集合内才会被采用，任何失败都会静默回退到原有默认路由，派遣卡片会多显示一行 Jev 建议的模型与推理强度，或说明 Jev 暂不可用、已使用默认路由。密钥从不会回显到界面、日志、卡片或对话；新增的 `subagent-advisor`、`subagent-advisor-set` 与 `subagent-advisor-key-set` CLI 命令可在不经 Web 界面的情况下完成配置（[#1984](https://github.com/BotHarness/DeepSeekBot/issues/1984)）。
