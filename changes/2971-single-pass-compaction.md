---
section: Fixed
---

## en

- Fixed automatic compaction firing on every step of a long Bot conversation and freeing only a few thousand tokens each time: one pass now compacts down to a target level, and when no pass can get under the threshold the Host skips it and logs why instead of re-summarizing the previous summary ([#2971](https://github.com/BotHarness/DeepSeekBot/issues/2971)).

## zh

- 修复了长 Bot 会话里自动压缩每一步都触发、每次只释放几千 tokens 的问题：现在一次压缩到目标水位；当压缩无法降到阈值以下时，Host 会跳过并记录原因，不再反复重压上一次的摘要（[#2971](https://github.com/BotHarness/DeepSeekBot/issues/2971)）。
