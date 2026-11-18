---
section: Added
---

## en

- The model editor on desktop, the Host model settings for remote Hosts, and the phone's Preset and Bot model screens now pick Routing Groups for the main model, the Assignment default and the allowed list. A Routing Group in the allowed list shows its name, how many models it has, the model it runs on now and its note, and on desktop its effort range and note are editable, with a button to clear a range its models no longer share. Saving a Preset or Bot model keeps the stored Assignment default and allowed models, and the phone keeps open Assignments. Save as Preset on a Bot that follows a default Routing Group keeps that group. `deepseekbot model-plan-set` takes `orchestratorGroupId` and the Assignment Routing Group fields ([#4501](https://github.com/BotHarness/DeepSeekBot/issues/4501)).

## zh

- 桌面端模型编辑器、远程 Host 的模型设置，以及手机端的预设和 Bot 模型页面，现在可以为主模型、任务默认模型和可选列表选择路由组。可选列表中的路由组会显示名称、包含几个模型、当前使用的模型和说明；在桌面端还可以编辑它的思考强度范围和说明；组内模型不再共有原来的强度时，可以一键清除。保存预设或 Bot 模型时会保留原来的任务默认模型和可选列表，手机端也不会关掉“任务可用任何模型”。跟随默认路由组的 Bot 另存为预设时会保留这个组。`deepseekbot model-plan-set` 支持 `orchestratorGroupId` 和任务路由组字段（[#4501](https://github.com/BotHarness/DeepSeekBot/issues/4501)）。
