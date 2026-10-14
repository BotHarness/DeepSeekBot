---
section: Changed
---

## en

- A Bot now runs Shell and tools from other installed plugins, such as `ops_bash`, under its Session's own DeepSeek Harness permission mode, with no extra approval card for each call. When DeepSeek Harness itself asks for permission, for example a Shell command that needs to leave the sandbox, the request appears as an approval card in the Bot's chat. Secret tools, editing an original attachment, Browser and Computer still ask as before ([#1731](https://github.com/BotHarness/DeepSeekBot/issues/1731)).

## zh

- Bot 现在按其 Session 自身的 DeepSeek Harness 权限模式运行 Shell 以及其他已安装插件提供的工具（例如 `ops_bash`），不再为每次调用额外弹出审批卡。DeepSeek Harness 自己请求权限时（例如 Shell 命令需要离开沙箱），该请求会以审批卡出现在 Bot 的聊天中。密钥工具、编辑原始附件、浏览器与电脑操作仍按原方式请求批准（[#1731](https://github.com/BotHarness/DeepSeekBot/issues/1731)）。
