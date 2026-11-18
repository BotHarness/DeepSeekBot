---
section: Added
---

## en

- A Bot on a Subscription Engine can now run on a model and effort of your choice. `deepseekbot engine models codex|claude` lists what your Codex or Claude subscription offers, with its effort levels, and `deepseekbot engine use <bot> claude --role orchestrator --model opus --effort high` switches the Bot's Orchestrator to it. The Host checks the choice against the list and resumes the same engine conversation on the new model ([#4488](https://github.com/BotHarness/DeepSeekBot/issues/4488)).

## zh

- 运行在订阅引擎上的 Bot 现在可以选择模型和 effort。`deepseekbot engine models codex|claude` 列出你的 Codex 或 Claude 订阅可用的模型及其 effort 档位，`deepseekbot engine use <bot> claude --role orchestrator --model opus --effort high` 把 Bot 的 Orchestrator 切到该模型。Host 会对照列表检查选择，并在新模型上继续同一段引擎对话（[#4488](https://github.com/BotHarness/DeepSeekBot/issues/4488)）。
