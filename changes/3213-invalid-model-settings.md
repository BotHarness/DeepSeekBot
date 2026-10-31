---
section: Fixed
---

## en

- Fixed malformed optional model plans or revision watermarks preventing the Bot registry from starting. Unusable fields are ignored on read without dropping Bots; valid plans, legacy model choices and revision watermarks are retained. Registry writes reject invalid records, but cannot prevent external SQL edits ([#3213](https://github.com/BotHarness/DeepSeekBot/issues/3213)).

## zh

- 修复非法可选模型计划或修订号导致 Bot 注册表无法启动的问题。读取时忽略不可用字段而不丢弃 Bot，保留有效计划、旧模型选择和修订号；注册表写入会拒绝非法记录，但无法阻止外部 SQL 修改（[#3213](https://github.com/BotHarness/DeepSeekBot/issues/3213)）。
