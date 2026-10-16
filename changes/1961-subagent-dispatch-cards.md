---
section: Added
---

## en

- A PersonaBot's native Subagent delegations (`subagent` / `subagent_fork` / `bot_subagent` / `bot_subagent_fork`) appear as one collapsible card in the owning Channel, updated in place from queued to running and then completed, failed or declined, showing the delegation title plus the actual model and reasoning effort when known. The card is an ordinary system message persisted in Channel history, so its latest status survives a refresh or Host restart ([#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)).

## zh

- PersonaBot 的原生子代理派遣（`subagent` / `subagent_fork` / `bot_subagent` / `bot_subagent_fork`）会在所属 Channel 中显示为一张可折叠卡片，并就地更新：已排队 → 运行中 → 已完成 / 失败 / 已拒绝；同时显示派遣标题，以及已知的实际模型与推理强度。该卡片是持久化在 Channel 历史中的普通系统消息，刷新或 Host 重启后仍保留最新状态（[#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)）。
