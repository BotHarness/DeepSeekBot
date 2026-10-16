---
section: Added
---

## en

- A PersonaBot's native Subagent delegations (`subagent` / `subagent_fork` / `bot_subagent` / `bot_subagent_fork`) appear as one collapsible card in the owning Channel, updated in place from queued to running and then completed, failed or declined, showing the delegation title plus the actual model and reasoning effort when known. The card is an ordinary system message persisted in Channel history, so its latest status survives a refresh or Host restart ([#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)).
- Several subagent dispatches started at the same time fold into one collapsible group card — a summary row with the count and per-status dots that expands to one compact status row per delegation; each single card is now also a compact row with a pulsing status dot and a status pill ([#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)).

## zh

- PersonaBot 的原生子代理派遣（`subagent` / `subagent_fork` / `bot_subagent` / `bot_subagent_fork`）会在所属 Channel 中显示为一张可折叠卡片，并就地更新：已排队 → 运行中 → 已完成 / 失败 / 已拒绝；同时显示派遣标题，以及已知的实际模型与推理强度。该卡片是持久化在 Channel 历史中的普通系统消息，刷新或 Host 重启后仍保留最新状态（[#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)）。
- 同一时刻启动的多个子代理派遣会折叠为一张可展开的分组卡片：摘要行显示数量与各状态圆点，展开后每个派遣一行紧凑状态行；单张卡片也改为紧凑行样式，带呼吸状态圆点与状态徽标（[#1961](https://github.com/BotHarness/DeepSeekBot/issues/1961)）。
