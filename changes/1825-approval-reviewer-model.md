---
section: Added
---

## en

- One Profile-wide setting now picks the model every Approval Reviewer uses, in settings under Auto approval or with `deepseekbot approval-reviewer-model-set <provider>/<model>`; `bot` (the default) keeps each Bot's own model. If the chosen model is unavailable, the call goes to you as the usual card and the reason is logged; the reviewer never switches to another model by itself. A Bot changing this setting from its Shell always needs your own approval ([#1825](https://github.com/BotHarness/DeepSeekBot/issues/1825)).

## zh

- 现在可以用一个 Profile 级设置指定所有审批员共用的模型：在设置的“自动审批”里，或用 `deepseekbot approval-reviewer-model-set <provider>/<model>`；默认的 `bot` 表示跟随每个 Bot 自己的模型。指定的模型不可用时，这次调用会按原来的卡片交给你，并记录原因；审批员绝不会自己换用别的模型。Bot 在自己的 Shell 里改这个设置，永远需要你本人批准（[#1825](https://github.com/BotHarness/DeepSeekBot/issues/1825)）。
