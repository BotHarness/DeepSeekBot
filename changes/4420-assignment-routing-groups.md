---
section: Added
---

## en

- Assignments can run on a Routing Group. `model-plan-assignments-set` takes `assignmentGroups` and a default group, `create_assignment` takes `group`, and an Assignment whose model runs out moves to the next member with one notice in the Bot's DM and keeps working. `list_assignment_models` shows which routes are resting and until when, and Subagents can start on a group's first usable member ([#4420](https://github.com/BotHarness/DeepSeekBot/issues/4420)).

## zh

- Assignment 可以使用路由组。`model-plan-assignments-set` 接受 `assignmentGroups` 和默认组，`create_assignment` 接受 `group`；Assignment 的模型用完时会切到下一个成员，在 Bot 的 DM 中留一条通知并继续工作。`list_assignment_models` 会显示哪些路由在休息、休息到何时，Subagent 也可以从组内第一个可用成员启动（[#4420](https://github.com/BotHarness/DeepSeekBot/issues/4420)）。
