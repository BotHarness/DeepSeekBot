---
section: Fixed
---

## en

- Align the mobile app with the SDK 58 Expo, development client and SQLite patch versions required by compatibility checks, retaining the Android activity shutdown fix. Existing development builds must be rebuilt for the updated native dependencies.
- Startup diagnostic reports now retain the database failure stage, bounded underlying error codes and observed writer identity, so lock contention can be distinguished from file access and migration failures. Correlated startup and close records are included in sanitized online and offline exports; writer metadata is explicitly a clue, not proof of a live process ([#4049](https://github.com/BotHarness/DeepSeekBot/issues/4049)).

## zh

- 同步移动端 SDK 58 的 Expo、开发客户端及 SQLite 补丁版本，使其通过兼容性检查，并保留 Android Activity 关闭修复。使用更新后的原生依赖需要重新构建开发客户端。
- 启动诊断报告现在保留数据库失败阶段、有数量限制的底层错误码及观察到的占锁实例信息，帮助区分写锁冲突、文件访问失败和迁移失败。脱敏的在线与离线导出包含可关联的启动及关闭记录；占锁元数据明确标为线索，不代表进程仍存活（[#4049](https://github.com/BotHarness/DeepSeekBot/issues/4049)）。
