---
section: Fixed
---

## en

- Scrolling a long chat history on desktop now keeps up with 60 Hz and gets closer to 120 Hz: each message mounts into its own fixed slot instead of the shared list, so the page no longer restyles every loaded message. On a 600-message Group, frames over 16.7 ms while wheel-scrolling dropped from about 11% to about 1% with the history loaded and from about 14% to about 1% while older pages load (PR_LINK).

## zh

- 桌面端滚动较长的聊天历史能稳住 60 Hz，也更接近 120 Hz：每条消息挂载到自己固定的槽位，而不是插进整条列表，页面不再为每次挂载重算所有已加载消息的样式。在 600 条消息的群聊里用滚轮滚动时，超过 16.7ms 的帧在历史已加载时从约 11% 降到约 1%，在边滚动边加载更早消息时从约 14% 降到约 1%（PR_LINK）。
