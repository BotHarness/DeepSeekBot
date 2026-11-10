---
section: Fixed
---

## en

- A Bot call on the Windows desktop keeps going while the window is minimized or closed to the tray: the Host now counts the call's live audio connection as a sign the window is still there, instead of ending the call when the hidden page answers late. Clicking the call notification or any message notification brings a minimized or tray-hidden window back to the front on the right chat, and a notification you clicked or dismissed no longer reappears while the window stays hidden. `deepseekbot desktop-window-reveal` brings the window back from the command line ([#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)).

## zh

- Windows 桌面端在最小化或关到托盘后，Bot 通话会继续进行：隐藏的页面回应变慢时，Host 会把通话仍在传输的音频连接视为窗口还在，不再直接挂断。点击通话通知或任何消息通知，都会把最小化或托盘中的窗口带回前台并打开对应的聊天；窗口仍隐藏时，已点击或已关闭的通知不会再次弹出。`deepseekbot desktop-window-reveal` 可在命令行把窗口带回前台（[#3833](https://github.com/BotHarness/DeepSeekBot/issues/3833)）。
