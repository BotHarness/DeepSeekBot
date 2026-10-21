---
section: Fixed
---

## en

- Kept the core CLI entry point external when bundling `deepseekbot`, so rebuilding with existing core outputs preserves dependency resource paths and the installed CLI starts correctly ([#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436)).

## zh

- 打包 `deepseekbot` 时保留 core CLI 入口为外部依赖，避免已有 core 构建产物被再次内联后破坏依赖资源路径，确保安装后的 CLI 正常启动（[#2436](https://github.com/BotHarness/DeepSeekBot/pull/2436)）。
