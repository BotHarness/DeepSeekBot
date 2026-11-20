---
section: Fixed
---

## en

- Isolated development preparations copy new runtime and Profile dependencies to avoid shared package-file metadata churn. Unchanged legacy installations restart read-only; dependency or source-link changes require a fresh Home and preserve existing data ([#4135](https://github.com/BotHarness/BotHarness/issues/4135)).

## zh

- 隔离开发环境准备时，将新 runtime 与 Profile 依赖安装为独立副本，避免共享包文件的元数据变化互相干扰。未变更的旧安装只读重启；变更依赖或源码链接时要求新建 Home，并保留旧数据（[#4135](https://github.com/BotHarness/BotHarness/issues/4135)）。
