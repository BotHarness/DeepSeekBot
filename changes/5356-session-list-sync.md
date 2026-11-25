---
section: Changed
---

## en

- The phone keeps the Sessions list on the device and asks the Host only for what changed since its last sync, so opening the list makes no full download and a busy Host sends a few changed rows instead of whole pages. `deepseekbot session-list-changes` reads the same change cursor ([#5356](https://github.com/BotHarness/DeepSeekBot/issues/5356)).

## zh

- 手机会把会话列表保存在本机，只向 Host 获取上次同步之后的变化。打开列表不再整份下载；Host 上的会话频繁变化时，也只传几行变化，而不是整页。`deepseekbot session-list-changes` 可读取同一个变更游标（[#5356](https://github.com/BotHarness/DeepSeekBot/issues/5356)）。
