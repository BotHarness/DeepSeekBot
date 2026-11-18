---
section: Added
---

## en

- A Model Preset or Model Plan can give each Assignment Routing Group an allowed effort range, a default effort and a note. `list_assignment_models` now shows each group's members, its current member, its efforts and its note, and `create_assignment` accepts `reasoning_effort` for a group within that range. Only efforts that every member supports can be saved. Set them with `assignmentGroupOptions` in `deepseekbot preset-create`, `preset-update` or `model-plan-assignments-set` ([#4502](https://github.com/BotHarness/DeepSeekBot/issues/4502)).

## zh

- 模型预设或模型方案可以为每个副模型路由组设置允许的思考强度范围、默认强度和说明。`list_assignment_models` 会列出每个组的成员、当前成员、强度和说明，`create_assignment` 在范围内为路由组接受 `reasoning_effort`。只能保存所有成员都支持的强度。用 `deepseekbot preset-create`、`preset-update` 或 `model-plan-assignments-set` 的 `assignmentGroupOptions` 设置（[#4502](https://github.com/BotHarness/DeepSeekBot/issues/4502)）。
