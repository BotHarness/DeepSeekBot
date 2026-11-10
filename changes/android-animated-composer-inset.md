---
section: Fixed
---

## en

- Android chat uses the message box's animated height for its scroll inset while normal motion is enabled, keeping the existing spring and fade edge together instead of waiting for outer layout callbacks ([#3920](https://github.com/BotHarness/DeepSeekBot/issues/3920)).

## zh

- Android 开启正常动画时，对话滚动留白使用输入框实际动画高度，保留原有弹簧动画，让底部遮罩边缘同步跟随，不再等待外层布局回调（[#3920](https://github.com/BotHarness/DeepSeekBot/issues/3920)）。
