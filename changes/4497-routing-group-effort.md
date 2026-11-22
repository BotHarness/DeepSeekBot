---
section: Changed
---

## en

- A Routing Group now takes one reasoning effort, chosen like a model's. Its choices are the efforts shared by members that support reasoning; members without reasoning don't narrow them and run without an effort. Bot plans and Presets store the Orchestrator group's effort, and `--orchestrator-effort` sets it together with `--orchestrator-group` in `deepseekbot model-plan-customize`, `model-preset-create` and `model-preset-update`. A member's own effort, set through the CLI, still wins ([#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)).

## zh

- 路由组现在像模型一样选一个推理强度。可选项是所有支持推理的成员共有的强度；不支持推理的成员不缩小范围，运行时也不带强度。Bot 方案和预设会保存主模型路由组的强度，`deepseekbot model-plan-customize`、`model-preset-create`、`model-preset-update` 中 `--orchestrator-effort` 与 `--orchestrator-group` 一起使用即可设置。通过 CLI 给成员单独设的强度仍然优先（[#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)）。
