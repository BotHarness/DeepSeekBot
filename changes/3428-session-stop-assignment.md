---
section: Added
---

## en

- Stop one running Assignment from its row in the Sessions panel. The Bot keeps answering and its other Assignments keep running. The stop does not start a new Orchestrator turn; at its next turn the Bot learns that you stopped the Assignment and does not send it out again unless you ask. The stopped Assignment keeps its history, and the Bot can resume it later with a new Assignment Request. Agents and scripts use `deepseekbot session-stop <bot> <session-id>` ([#3428](https://github.com/BotHarness/DeepSeekBot/issues/3428)).

## zh

- 现在可以在 Sessions 面板中，从某个运行中 Assignment 的那一行单独停止它。Bot 会继续回复，其他 Assignment 也继续运行。停止不会触发新的 Orchestrator 回合；Bot 在下一轮会得知你停止了这个 Assignment，除非你要求，否则不会再次派发。被停止的 Assignment 保留历史，Bot 之后可以用新的 Assignment Request 让它继续。Agent 和脚本可以使用 `deepseekbot session-stop <bot> <session-id>`（[#3428](https://github.com/BotHarness/DeepSeekBot/issues/3428)）。
