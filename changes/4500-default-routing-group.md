---
section: Added
---

## en

- The global default model can be a Routing Group. Bots that follow the default run on the group's first usable member and fall back within the group, and their Assignments use it too. Set it with `deepseekbot home-model-set --group <id>`; choosing a single model again clears it ([#4500](https://github.com/BotHarness/DeepSeekBot/issues/4500)).

## zh

- 全局默认模型现在可以是路由组。跟随默认模型的 Bot 会使用组里第一个可用的成员，并在组内切换备用模型，它们的副模型任务也一样。用 `deepseekbot home-model-set --group <id>` 设置；再选单个模型即可清除（[#4500](https://github.com/BotHarness/DeepSeekBot/issues/4500)）。
