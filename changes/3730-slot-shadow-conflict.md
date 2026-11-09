---
section: Fixed
---

## en

- Bot workbench shadows no longer black-screen the desktop when another Bot-style plugin occupies the same sidebar slot: shadow entries moved off the conventional `-100`/`-1` priorities, same-priority occupants are skipped with a warning (keeping the first entry), and fallback priorities are tried before giving up ([#3730](https://github.com/BotHarness/BotHarness/issues/3730)).

## zh

- 当另一个同类 Bot 插件占用同一侧栏插槽时，Bot 工作台遮蔽不再让桌面端黑屏：遮蔽项已避开惯用的 `-100`/`-1` 优先级，同优先级占用会被跳过并记录警告（保留先注册者），放弃前还会尝试备用优先级 ([#3730](https://github.com/BotHarness/BotHarness/issues/3730))。
