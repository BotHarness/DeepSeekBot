---
section: Added
---

## en

- A Model Preset can now hold Routing Groups: the Orchestrator, the Assignment default and the allowed Assignment list may each name a group. Applying the Preset gives the Bot the same groups, and later edits to a group reach every Bot that uses it. `deepseekbot model-preset-create` and `model-preset-update` take `--orchestrator-group`, `--assignment-groups` and `--assignment-default-group`. An older app that would drop a Preset's groups is asked to update instead ([#4499](https://github.com/BotHarness/DeepSeekBot/issues/4499)).

## zh

- 模型预设现在可以使用路由组：主模型、副模型默认值和副模型可选列表都可以选路由组。应用预设后 Bot 会用同样的路由组，之后修改路由组会作用到所有用它的 Bot。`deepseekbot model-preset-create` 和 `model-preset-update` 新增 `--orchestrator-group`、`--assignment-groups` 和 `--assignment-default-group`。旧版客户端保存会丢掉路由组的预设时，会被要求先更新（[#4499](https://github.com/BotHarness/DeepSeekBot/issues/4499)）。
