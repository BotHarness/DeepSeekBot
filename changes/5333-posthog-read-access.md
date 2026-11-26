---
section: Fixed
---

## en

- A Bot with Read access to a PostHog App connection can now query PostHog. PostHog offers a single command tool, so the Host checks each command and lets read commands (search, info, schema, learn, and tools that get, list, query or search) through, while commands that change data still need Read and write ([#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)).

## zh

- 对 PostHog 应用连接只有只读权限的 Bot 现在可以查询 PostHog 了。PostHog 只提供一个通用命令工具，Host 会逐条检查命令：只读命令（search、info、schema、learn，以及获取、列出、查询、搜索类工具）放行，会改数据的命令仍需要可读写权限（[#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)）。
