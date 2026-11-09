---
section: Fixed
---

## en

- Hanging up a call while the camera or screen is shared now tells the Host the share is off before the call ends, so the Host records `visual off`. The Host also turns a share off itself when a call ends with it still on, for example when the page closes ([#3785](https://github.com/BotHarness/DeepSeekBot/issues/3785)).

## zh

- 在共享摄像头或屏幕时挂断通话，会先通知 Host 共享已关闭再结束通话，Host 会记录 `visual off`。通话结束时若共享仍开着（例如页面被关闭），Host 也会自己关闭共享（[#3785](https://github.com/BotHarness/DeepSeekBot/issues/3785)）。
