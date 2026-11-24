---
section: Added
---

## en

- Bot questions and execution approvals raised from a Lark group are posted in that group, where anyone with an approved management pairing and the needed capability can answer or decide. This is on by default; set `groupInteractions: false` in the platform defaults, or run `deepseekbot messaging-group-interactions <bot-id> --binding <binding-id> --disabled` for one app, to keep them in the management DM ([#5244](https://github.com/BotHarness/DeepSeekBot/issues/5244)).

## zh

- 在飞书群里触发的 Bot 提问和执行审批会直接发到该群，已获批管理配对且具备相应权限的人可在群里回答或审批。默认开启；在平台默认设置中设 `groupInteractions: false`，或对单个应用运行 `deepseekbot messaging-group-interactions <bot-id> --binding <binding-id> --disabled`，可改回只发到管理 DM（[#5244](https://github.com/BotHarness/DeepSeekBot/issues/5244)）。
