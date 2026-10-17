---
section: Added
---

## en

- Answer Hermes-style slash commands sent as a whole DM message directly in the IM chat without starting a Bot turn: `/commands`, `/help`, `/status`, `/model`, `/effort`, `/stop` and `/new`, with Chinese aliases and full-width `／` accepted ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).
- Read-only replies are open to any admitted DM sender; model, effort, stop and fresh-session changes stay limited to admitted senders on Weixin and to approved management pairings on Feishu/Slack/Discord, pointing senders without management access to the Web app ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).
- Add `deepseekbot bot-new-session <Bot ID>` to retire an idle Orchestrator Session through the same Host runtime as `/new` ([#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)).

## zh

- 在 IM 私聊中整条消息为斜杠命令时，由 Host 直接回复，不再启动 Bot 轮次：`/commands`、`/help`、`/status`、`/model`、`/effort`、`/stop`、`/new`，支持中文别名与全角 `／`（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
- 只读回复向所有已准入的私聊发送者开放；切换模型、强度、停止与开启新会话在微信上仅限已准入发送者，在飞书/Slack/Discord 上还需已批准的管理配对，无管理权限时引导使用 Web 端（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
- 新增 `deepseekbot bot-new-session <Bot ID>`，通过与 `/new` 相同的 Host 运行时退役空闲的编排会话（[#2005](https://github.com/BotHarness/DeepSeekBot/issues/2005)）。
