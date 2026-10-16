---
section: Fixed
---

## en

- Fixed an early local Browser viewer URL that could request a frame before its Bot owned a tab; first-frame waits and failures now remain distinct from a stopped Browser, with bounded requests and explicit reconnection ([#2012](https://github.com/BotHarness/DeepSeekBot/issues/2012)).

## zh

- 修复本地 Browser 在 Bot 尚未取得标签页时过早发布画面地址的问题；首帧等待和失败现与浏览器停止明确区分，请求有时限，失败后可显式重连（[#2012](https://github.com/BotHarness/DeepSeekBot/issues/2012)）。
