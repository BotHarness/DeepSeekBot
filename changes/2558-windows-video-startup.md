---
section: Fixed
---

## en

- Fixed Windows Local Computer video startup failing on Electron's bootstrap output, input stream and display notifications, including fractional display scaling ([#2558](https://github.com/BotHarness/BotHarness/issues/2558)).

- Fixed Android Release Computer video crashing while loading WebRTC. Rebuild the Android app to include the JNI retention rules.

## zh

- 修复 Windows 本机电脑视频因 Electron 启动输出、输入流及显示通知而无法启动的问题，并处理非整数显示缩放带来的尺寸误差（[#2558](https://github.com/BotHarness/BotHarness/issues/2558)）。

- Android Release：保留 WebRTC/JNI Zero 入口，修复打开电脑视频时的原生崩溃。需要重新构建 Android 应用。
