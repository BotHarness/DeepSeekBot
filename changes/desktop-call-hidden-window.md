---
section: Fixed
---

## en

- A Bot call on the Windows desktop no longer drops when the window is minimized or closed to the tray and one heartbeat request is slow or lost: the window retries it at once. Clicking the call notification or any message notification now brings a minimized or tray-hidden window back to the front on the right chat, and a notification you clicked or dismissed no longer reappears while the window stays hidden. `deepseekbot desktop-window-reveal` does the same from the command line ([#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)).

## zh

- Windows 桌面端在最小化或关到托盘后，即使某次心跳请求变慢或丢失，Bot 通话也不会再断开，窗口会立即重试。点击通话通知或任何消息通知，现在都会把最小化或托盘中的窗口带回前台并打开对应的聊天；窗口仍隐藏时，已点击或已关闭的通知不会再次弹出。`deepseekbot desktop-window-reveal` 可在命令行执行同样的操作（[#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)）。
