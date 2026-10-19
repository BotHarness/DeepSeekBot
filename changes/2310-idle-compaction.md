---
section: Added
---

## en

- Added Idle Compaction: when a Bot's Orchestrator Session has been idle for half its model route's prompt-cache lifetime (never before 15 minutes; DeepSeek routes assume 2 hours until observed), the Host compacts it through DSH while the cache is still warm, so the next message re-reads a shorter context. It is on by default under Settings → Models, never shows in the chat, records each run in Bot activity, and is operable with `deepseekbot idle-compaction`, `idle-compaction-set` and `idle-compaction-cache-set` ([#2310](https://github.com/BotHarness/DeepSeekBot/issues/2310)).

## zh

- 新增空闲压缩（Idle Compaction）：Bot 的 Orchestrator Session 空闲到所用模型提示缓存寿命的一半时（最少 15 分钟；DeepSeek 在观测到实际数据前按 2 小时估计），Host 趁缓存还在通过 DSH 压缩它，之后再聊时要重读的上下文更短。默认开启，可在 设置 → 模型 关闭，聊天中不显示，每次都记录在 Bot 活动里，也可用 `deepseekbot idle-compaction`、`idle-compaction-set` 和 `idle-compaction-cache-set` 操作（[#2310](https://github.com/BotHarness/DeepSeekBot/issues/2310)）。
