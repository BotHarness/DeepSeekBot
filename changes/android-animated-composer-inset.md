---
section: Fixed
---

## en

- Android chat uses the message box's animated height for its scroll inset while normal motion is enabled, keeping the existing spring and fade edge together and preserving latest-message following through growth and shrinkage instead of waiting for outer layout callbacks ([#3920](https://github.com/BotHarness/DeepSeekBot/issues/3920)).

## zh

- Android 开启正常动画时，对话滚动留白使用输入框实际动画高度，保留原有弹簧动画，让底部遮罩边缘同步跟随，并在输入框增高和收起时保持最新消息位置，不再等待外层布局回调（[#3920](https://github.com/BotHarness/DeepSeekBot/issues/3920)）。
