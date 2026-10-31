---
section: Changed
---

## en

- Messaging now owns external Inbox readiness and records default reception separately from optional Bridge routes. Historical messages keep their saved policies without backfill; upgraded Profiles require the new reader or a pre-upgrade backup when downgrading ([#3261](https://github.com/BotHarness/DeepSeekBot/issues/3261), [ADR-0276](../docs/adr/0276-messaging-owns-external-readiness-and-reception-evidence.md)).

## zh

- Messaging 统一负责外部 Inbox 消息的就绪判断，并分别记录默认接收与可选 Bridge 路由。历史消息保留原有策略，不补写路由；升级后的 Profile 需要新版读取器，降级需恢复升级前备份（[#3261](https://github.com/BotHarness/DeepSeekBot/issues/3261)，[ADR-0276](../docs/adr/0276-messaging-owns-external-readiness-and-reception-evidence.md)）。
