---
section: Added
---

## en

- `deepseekbot bot-trace <bot>` shows which tools a Bot called in its recent turns, with arguments, outcome (including approvals that were rejected) and the start of each result, read from the Bot's own Session log. Secret tools are never shown. Together with `browser-tool` and `computer-tool` it tells whether a failure comes from the model, the Harness or the Browser and Computer ([#1682](https://github.com/BotHarness/DeepSeekBot/issues/1682)).

## zh

- `deepseekbot bot-trace <bot>` 从 Bot 自己的会话日志中读出它最近几轮调用了哪些工具，包括参数、结果（含被拒绝的审批）和每个结果的开头部分；密钥类工具从不显示。配合 `browser-tool` 和 `computer-tool`，可以判断问题出在模型、Harness，还是浏览器和 Computer（[#1682](https://github.com/BotHarness/DeepSeekBot/issues/1682)）。
