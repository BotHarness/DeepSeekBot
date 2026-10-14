---
section: Added
---

## en

- You can now run a Bot's Browser tools directly from the CLI, without the model: `deepseekbot browser-tools` lists them and `browser-tool <bot> <tool> --args-stdin` runs one through the same code, Browser Access check and audit the Bot uses. Comparing it with `send` shows whether a failure comes from the Browser, the Harness or the model ([#1682](https://github.com/BotHarness/DeepSeekBot/issues/1682)).

## zh

- 现在可以绕过模型、直接用命令行执行 Bot 的浏览器工具：`deepseekbot browser-tools` 列出工具，`browser-tool <bot> <tool> --args-stdin` 通过 Bot 使用的同一段代码、同样的浏览器权限检查和审计执行其中一个。把它和 `send` 对比，就能判断问题出在浏览器、Harness 还是模型（[#1682](https://github.com/BotHarness/DeepSeekBot/issues/1682)）。
