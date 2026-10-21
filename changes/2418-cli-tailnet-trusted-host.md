---
section: Fixed
---

## en

- Fixed the misleading "refresh its launch token" error when the `deepseekbot` CLI reaches a Host through its tailnet name: the CLI now reports `host-untrusted` and names the `--trusted-host` flag the Host needs ([#2418](https://github.com/BotHarness/DeepSeekBot/pull/2418)).

## zh

- 修复 `deepseekbot` CLI 通过 tailnet 名称访问 Host 时误报“刷新启动令牌”的问题：CLI 现在返回 `host-untrusted`，并指出 Host 需要的 `--trusted-host` 参数（[#2418](https://github.com/BotHarness/DeepSeekBot/pull/2418)）。
