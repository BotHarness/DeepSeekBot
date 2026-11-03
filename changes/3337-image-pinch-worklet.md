---
section: Fixed
---

## en

- Fixed image-viewer pinch zoom throwing a `MAX_SCALE` reference error in the gesture runtime; default zoom limits are now read inside the worklet body, while double-tap and explicit canvas limits stay unchanged ([#3337](https://github.com/BotHarness/BotHarness/issues/3337)).

## zh

- 修复图片查看器双指缩放在手势运行环境中触发 `MAX_SCALE` 引用错误的问题；默认缩放范围改为在 worklet 函数体内读取，双击缩放和显式画布范围保持不变（[#3337](https://github.com/BotHarness/BotHarness/issues/3337)）。
