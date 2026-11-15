---
section: Fixed
---

## en

- First-run Tob Memory preparation runs Git commands asynchronously, so lightweight settings queries can respond before preparation completes ([#4226](https://github.com/BotHarness/DeepSeekBot/issues/4226)).

- Model pickers and approval settings read native configuration once per model catalog request and share credential checks within that request, reducing repeated work while still reading fresh settings on the next request ([#4226](https://github.com/BotHarness/DeepSeekBot/issues/4226)).

## zh

- 首次 Tob Memory 准备异步执行 Git 命令，轻量设置查询可以在准备完成前响应（[#4226](https://github.com/BotHarness/DeepSeekBot/issues/4226)）。

- 模型选择器和审批设置在每次模型目录请求中只读取一次原生配置，并共享本次请求内的凭据检查，减少重复工作；下一次请求仍读取最新设置（[#4226](https://github.com/BotHarness/DeepSeekBot/issues/4226)）。
