---
section: Changed
---

## en

- The phone Sessions list now opens instantly after the first time: it shows the last list right away and refreshes it in the background, and it updates when Sessions change on the Host. Long lists load 50 Sessions at a time as you scroll, and a Session you opened before shows its last transcript while it reloads. `deepseekbot session-list` gains `--limit` and `--cursor` for paging ([#5256](https://github.com/BotHarness/DeepSeekBot/issues/5256)).

## zh

- 手机端的会话列表在第一次之后会立即打开：先显示上一次的列表，再在后台刷新；Host 上的会话有变化时列表也会更新。较长的列表在滚动时每次加载 50 个会话；打开过的会话在重新加载时会先显示上一次的记录。`deepseekbot session-list` 新增 `--limit` 和 `--cursor` 用于分页（[#5256](https://github.com/BotHarness/DeepSeekBot/issues/5256)）。
