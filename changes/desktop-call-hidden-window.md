---
section: Fixed
---

## en

- A Bot call on the desktop no longer drops when one heartbeat request is lost: the window retries it at once. On a DSH Desktop that offers window presence, the call also keeps running while the window is minimized or closed to the tray, and clicking the call notification or any message notification brings the window back to the front on the right chat. A notification you clicked or dismissed no longer reappears while the window stays hidden ([#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)).

## zh

- 桌面端 Bot 通话不会再因为丢失一次心跳请求而断开，窗口会立即重试。在支持窗口状态能力的 DSH Desktop 上，最小化或关到托盘后通话会继续进行；点击通话通知或任何消息通知，都会把窗口带回前台并打开对应的聊天。窗口仍隐藏时，已点击或已关闭的通知不会再次弹出（[#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)）。
