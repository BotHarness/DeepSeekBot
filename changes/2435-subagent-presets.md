---
section: Changed
---

## en

- Independent Bot Subagents select an allowed explicit native preset, a configured child default, or the current DSH system default; forks retain the parent's preset. Their direct CLI calls now use the existing parent Agent's tool pipeline and refuse when no live parent is available ([#2435](https://github.com/BotHarness/DeepSeekBot/issues/2435)).

## zh

- 独立 Bot Subagent 依次使用允许的显式原生 preset、配置的子 Agent 默认值或当前 DSH 系统默认值；fork 继续继承父级。直接 CLI 调用复用现有父 Agent 的工具执行链，无存活父 Agent 时明确拒绝（[#2435](https://github.com/BotHarness/DeepSeekBot/issues/2435)）。
