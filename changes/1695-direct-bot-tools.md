---
section: Added
---

## en

- You can now run a Bot's Harness tools directly from the CLI, without the model: `deepseekbot bot-tools` lists them and `bot-tool <bot> <tool> --args-stdin` runs one as that Bot through the same tool code and checks a Bot turn uses, recorded under the session `direct` for `bot-trace`. Tools that only work inside a Bot turn, such as starting an Assignment or a Subagent, are refused with a code ([#1695](https://github.com/BotHarness/DeepSeekBot/issues/1695)).

## zh

- 现在可以绕过模型、直接用命令行执行 Bot 的 Harness 工具：`deepseekbot bot-tools` 列出工具，`bot-tool <bot> <tool> --args-stdin` 以该 Bot 的身份、通过 Bot 回合使用的同一段工具代码和检查执行其中一个，并以会话 `direct` 记录，可用 `bot-trace` 查看。只能在 Bot 回合内运行的工具（例如创建 Assignment 或 Subagent）会返回错误码拒绝执行（[#1695](https://github.com/BotHarness/DeepSeekBot/issues/1695)）。
