---
section: Fixed
---

## en

- Fixed core startup after upgrading a Profile that ran the generation-116 QQ-default hotfix: a forward migration restores the missing question-notification schema while retaining existing records and QQ preferences. Incompatible existing structures refuse migration without replacing the original database; this is not a general official 1.6.1 upgrade failure ([#4040](https://github.com/BotHarness/DeepSeekBot/issues/4040)).

## zh

- 修复运行过第 116 代 QQ 默认设置热修复的 Profile 升级后核心无法启动的问题：通过向前迁移补齐提问通知结构，保留已有记录和 QQ 偏好。遇到不兼容的既有结构时拒绝迁移、不替换原数据库；这不是官方 1.6.1 普遍存在的升级故障（[#4040](https://github.com/BotHarness/DeepSeekBot/issues/4040)）。
