---
section: Added
---

## en

- Customize the Web composer footer by right-clicking or long-pressing it: show or hide model, workspace, token usage and generation speed; drag items within the footer to reorder or align left/right, with an insertion indicator and keyboard alternatives. The footer stays on one line and truncates long names; in narrow chat panels, model/workspace controls collapse to icons with full-name tooltips while numeric metrics stay readable. Preferences stay in this browser; restore defaults at any time. Model, workspace and token usage are visible by default; generation speed and per-reply speed labels are opt-in. Completed replies use provider token counts when usable, otherwise a text estimate. Speed labels show only a number and `tps`, such as `36 tps`. The optional conversation average reads at most 200 messages over four pages and refreshes for completed measured replies, with no polling or history reads while hidden. Phone-width Web keeps the same applicable controls and preferences, with compact 28px-high buttons. Visibility switches stay open while editing; hiding all available items collapses the footer and moves the composer down. Type `/footer` to reopen settings ([#1958](https://github.com/BotHarness/DeepSeekBot/issues/1958)).

## zh

- Web 输入框底部支持右键或长按自定义：显示或隐藏模型、工作区、Token 用量和生成速度；进入调整模式后可拖动排序、靠左或靠右放置，并显示插入线，也支持键盘操作。底部保持单行，长名称显示省略号；聊天面板较窄时，模型和工作区收为图标，悬停可查看全名，数值指标保持可见。设置只保存在当前浏览器，可随时恢复默认。默认显示模型、工作区和 Token 用量；生成速度及逐条回复速度需手动开启。已完成回复优先使用可用的 Provider Token 计数，否则使用文本估算；速度标签统一简化为数字加 `tps`，例如 `36 tps`。可选平均速度最多读取四页、200 条消息，只在新的已测量回复完成时刷新，隐藏时不读取历史，也不轮询。手机宽度的 Web 也显示相同的适用按钮并沿用显隐和排序设置，按钮保持紧凑的 28px 高度。显隐面板支持连续切换；全部隐藏后底栏收起，输入框下移，可输入 `/footer` 重新打开设置（[#1958](https://github.com/BotHarness/DeepSeekBot/issues/1958)）。
