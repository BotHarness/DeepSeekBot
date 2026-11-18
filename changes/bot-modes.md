---
section: Added
---

## en

- Bots can run in any installed DSH mode, not only Tobs. Settings → Models sets the default mode for every Bot, and each Bot's settings can pick its own mode or follow the default; `deepseekbot bot-modes`, `bot-mode-default-set` and `bot-mode-set` do the same. A change applies from the Bot's next new Session. Mode templates limit which modes a Bot may use (every mode by default), and an Orchestrator can start an Assignment in any mode the Bot allows with `create_assignment`'s `mode`, which asks it to pick the lightest mode that covers the work. The Sessions panel shows each Session's mode, and `deepseekbot bot-sessions` returns it as `agentPreset` ([#4461](https://github.com/BotHarness/DeepSeekBot/pull/4461)).

## zh

- Bot 现在可以运行在任何已安装的 DSH 模式里，不再只能用 Tobs。在「设置 → 模型」里设定所有 Bot 的默认模式，在每个 Bot 的设置里可以单独选模式或跟随默认；`deepseekbot bot-modes`、`bot-mode-default-set` 和 `bot-mode-set` 也能完成同样的操作。改动从 Bot 的下一个新会话开始生效。模式模板限定一个 Bot 可以用哪些模式（默认全部可用），Orchestrator 也可以用 `create_assignment` 的 `mode` 让 Assignment 运行在这个 Bot 允许的任何模式里，并按提示选够用的最轻模式。会话面板会显示每个会话的模式，`deepseekbot bot-sessions` 也会以 `agentPreset` 返回（[#4461](https://github.com/BotHarness/DeepSeekBot/pull/4461)）。
