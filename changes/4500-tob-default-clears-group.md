---
section: Fixed
---

## en

- Setting the Host default model from Tob now stops the default from following a Routing Group, so Bots that follow the default run the model you chose. `deepseekbot home-model-set --group` also refuses an empty `--provider` or `--model` instead of ignoring it ([#4500](https://github.com/BotHarness/DeepSeekBot/issues/4500)).

## zh

- 通过 Tob 设置 Host 默认模型后，默认模型不再跟随路由组，跟随默认模型的 Bot 会改用你选择的模型。`deepseekbot home-model-set --group` 遇到空的 `--provider` 或 `--model` 时也会拒绝，而不是忽略（[#4500](https://github.com/BotHarness/DeepSeekBot/issues/4500)）。
