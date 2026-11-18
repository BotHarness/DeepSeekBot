---
section: Added
---

## en

- A PersonaBot's Orchestrator can now run on Claude Code with your own Claude subscription on this computer. `deepseekbot engine login claude` starts the Bot's own Claude sign-in (separate from your own `claude` login, settings and CLAUDE.md), and `deepseekbot engine use <bot> claude --role orchestrator` switches the Bot. The Host runs your installed `claude` through the Claude Agent SDK with provider keys removed, and refuses a login that is not a Claude subscription ([#4490](https://github.com/BotHarness/DeepSeekBot/issues/4490)).

## zh

- PersonaBot 的 Orchestrator 现在可以用你在这台电脑上的 Claude 订阅运行在 Claude Code 上。`deepseekbot engine login claude` 会为 Bot 开始单独的 Claude 登录（与你自己的 `claude` 登录、设置和 CLAUDE.md 分开），再用 `deepseekbot engine use <bot> claude --role orchestrator` 切换引擎。Host 通过 Claude Agent SDK 运行你安装的 `claude`，去掉服务商密钥，不是 Claude 订阅的登录会被拒绝（[#4490](https://github.com/BotHarness/DeepSeekBot/issues/4490)）。
