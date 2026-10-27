---
section: Fixed
---

## en

- Stop now frees a Bot whose Turn hangs before its Agent starts. When preparing the Turn (checking the model route, which lists the provider's models, or resuming the Session) never answered, the Bot looked idle with no Stop button, Stop from the CLI hung too, and every later message waited behind it until the Host restarted. The Bot now shows as thinking while it prepares, Stop ends that preparation, a preparation that runs past two minutes fails with a clear message, and the next message runs normally ([#2995](https://github.com/BotHarness/DeepSeekBot/issues/2995)).

## zh

- 「停止」现在能让卡在 Agent 启动之前的 Bot 恢复。准备这一轮（检查模型路由时会列出服务商的模型，或恢复会话）如果一直没有返回，Bot 看起来是空闲的、没有停止按钮，命令行里的停止也会卡住，之后每条消息都排在它后面，只能重启 Host。现在 Bot 准备期间显示为「思考中」，「停止」会结束这次准备，准备超过两分钟会带着明确的提示失败，下一条消息可以正常运行（[#2995](https://github.com/BotHarness/DeepSeekBot/issues/2995)）。
