---
section: Fixed
---

## en

- Added independent Android in-app alert controls with saved inserted or top-overlay styles and corrected safe-area ownership below inserted alerts; system notification settings remain separate ([#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)).
- Both in-app styles show the originating Channel avatar or Bot portrait, with the same fallback as conversations ([#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)).

- Avoid duplicate Android native-header top spacing while an inserted alert or routing notice already consumes the safe area; restore normal header spacing when it disappears ([#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)).

- Keep both in-app alert styles compact with a one-line title and two-line preview; tapping the preview opens its source conversation directly ([#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)).

- Default in-app notifications to the top overlay while preserving saved styles; tap to open or swipe left, right or up to dismiss, without extra buttons ([#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)).

## zh

- 为 Android 应用内提醒增加独立开关及可保存的插入式、顶部浮层样式，并修正插入式提醒下方的安全区归属；系统通知设置保持独立（[#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)）。
- 两种应用内提醒样式均显示来源 Channel 头像或 Bot 头像，未设置头像时沿用会话的默认标识（[#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)）。

- 插入式提醒或跳转提示已占用顶部安全区时，避免 Android 原生标题栏重复留白；提示消失后恢复正常间距（[#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)）。

- 两种应用内提醒均使用一行标题和两行简短预览，点击预览直接进入来源会话，不展开完整消息（[#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)）。

- 应用内通知默认使用顶部浮层，保留已保存的样式；移除打开与关闭按钮，点击进入对应聊天，左滑、右滑或上滑移除通知（[#3357](https://github.com/BotHarness/DeepSeekBot/issues/3357)）。
