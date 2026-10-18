---
section: Added
---

## en

- Answer Hermes-style slash commands sent as a whole DM message directly in the IM chat without starting a Bot turn: `/commands`, `/help`, `/status`, `/model`, `/effort`, `/stop` and `/new`, with Chinese aliases and full-width `／` accepted ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).
- Read-only replies are open to any admitted DM sender; model, effort, stop and fresh-session changes stay limited to admitted senders on Weixin and current management pairings with approval capability elsewhere. Commands run in order per Bot, recheck revoked authority, preserve Assignment model settings, and retain reply outcomes in the existing Outbox; group and attachment messages keep their normal path ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).
- Add `deepseekbot bot-new-session <Bot ID>` to retire an idle Orchestrator Session through the same Host runtime as `/new` ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).

## zh

- 在 IM 私聊中整条消息为斜杠命令时，由 Host 直接回复，不再启动 Bot 轮次：`/commands`、`/help`、`/status`、`/model`、`/effort`、`/stop`、`/new`，支持中文别名与全角 `／`（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
- 只读回复向已准入私聊发送者开放；模型、强度、停止与新会话操作在微信上限已准入发送者，其他平台需要当前具有批准能力的管理配对。命令按 Bot 顺序执行、复核权限撤销、保留任务模型设置，并沿用既有 Outbox 记录回复结果；群消息与带附件消息继续走原有路径（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
- 新增 `deepseekbot bot-new-session <Bot ID>`，通过与 `/new` 相同的 Host 运行时退役空闲的编排会话（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
